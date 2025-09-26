import { BatchConversionResult } from "@/common/file/conversion.js";
import {
  RecordFileFormat,
  detectRecordFileFormatByPath,
  exportRecordAsBuffer,
  importRecordFromBuffer,
} from "@/common/file/record.js";
import {
  BatchConversionSettings,
  DestinationType,
  FileNameConflictAction,
} from "@/common/settings/conversion.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getAppLogger } from "@/background/log.js";
import { AppSettings, TextDecodingRule } from "@/common/settings/app.js";
import { exists, listFiles } from "@/background/helpers/file.js";
import { loadAppSettings } from "@/background/settings.js";
import {
  ImmutableNode,
  ImmutableRecord,
  InitialPositionSFEN,
  Move,
  SpecialMoveType,
} from "tsshogi";
import { resolveConflictFilePath } from "./filename.js";

export async function convertRecordFiles(
  settings: BatchConversionSettings,
  onProgress?: (progress: number) => void,
): Promise<BatchConversionResult> {
  const appSettings = await loadAppSettings();
  const result: BatchConversionResult = {
    success: {},
    successTotal: 0,
    failed: {},
    failedTotal: 0,
    skipped: {},
    skippedTotal: 0,
  };

  getAppLogger().debug(`batch conversion: start ${JSON.stringify(settings)}`);
  const sourceFiles = (
    await listFiles(settings.source, settings.subdirectories ? Infinity : 0)
  ).filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return settings.sourceFormats.includes(ext as RecordFileFormat);
  });

  const writer =
    settings.destinationType === DestinationType.DIRECTORY
      ? new DirectoryWriter(settings, appSettings)
      : new SingleFileWriter(settings, appSettings);
  await writer.open();
  for (const source of sourceFiles) {
    if (onProgress) {
      const progress =
        (result.successTotal + result.failedTotal + result.skippedTotal) / sourceFiles.length;
      onProgress(progress);
    }
    const sourceFormat = detectRecordFileFormatByPath(source) as RecordFileFormat;
    try {
      const sourceData = await fs.readFile(source);
      const record = importRecordFromBuffer(sourceData, sourceFormat, {
        autoDetect: appSettings.textDecodingRule === TextDecodingRule.AUTO_DETECT,
      });
      if (record instanceof Error) {
        throw record;
      }
      if (await writer.write(record, source)) {
        result.successTotal++;
        result.success[sourceFormat] = (result.success[sourceFormat] || 0) + 1;
      } else {
        result.skippedTotal++;
        result.skipped[sourceFormat] = (result.skipped[sourceFormat] || 0) + 1;
      }
    } catch (e) {
      result.failedTotal++;
      result.failed[sourceFormat] = (result.failed[sourceFormat] || 0) + 1;
      getAppLogger().debug(`batch conversion: failed: ${source}: ${e}`);
    }
  }
  await writer.close();
  getAppLogger().debug(`batch conversion: completed`);

  return result;
}

class DirectoryWriter {
  constructor(
    private settings: BatchConversionSettings,
    private appSettings: AppSettings,
  ) {}

  async open(): Promise<void> {
    // noop
  }

  async write(record: ImmutableRecord, source: string): Promise<boolean> {
    // Generate destination path
    const parsed = path.parse(path.relative(this.settings.source, source));
    const name = parsed.name + this.settings.destinationFormat;
    let destination = path.join(
      this.settings.destination,
      this.settings.createSubdirectories ? path.join(parsed.dir, name) : name,
    );
    if (await exists(destination)) {
      switch (this.settings.fileNameConflictAction) {
        case FileNameConflictAction.OVERWRITE:
          break;
        case FileNameConflictAction.NUMBER_SUFFIX:
          destination = await resolveConflictFilePath(destination);
          break;
        case FileNameConflictAction.SKIP:
          getAppLogger().debug(`batch conversion: skipped: ${source}`);
          return false;
      }
    }

    // Create directory if not exists
    const destinationDir = path.dirname(destination);
    await fs.mkdir(destinationDir, { recursive: true });

    // Export record
    const exportResult = exportRecordAsBuffer(record, this.settings.destinationFormat, {
      returnCode: this.appSettings.returnCode,
      csa: { v3: this.appSettings.useCSAV3 },
    });
    await fs.writeFile(destination, exportResult.data);
    getAppLogger().debug(`batch conversion: success: ${source} -> ${destination}`);
    return true;
  }

  async close(): Promise<void> {
    // noop
  }
}

class SingleFileWriter {
  private fd?: fs.FileHandle;
  constructor(
    private settings: BatchConversionSettings,
    private appSettings: AppSettings,
  ) {}

  async open(): Promise<void> {
    this.fd = await fs.open(this.settings.singleFileDestination, "w");
  }

  async write(record: ImmutableRecord, source: string): Promise<boolean> {
    await this.writeUSI(record);
    getAppLogger().debug(`batch conversion: success: ${source}`);
    return true;
  }

  async close(): Promise<void> {
    await this.fd?.close();
  }

  async writeUSI(record: ImmutableRecord): Promise<void> {
    let position: string;
    const sfen = record.initialPosition.sfen;
    if (this.appSettings.enableUSIFileStartpos && sfen === InitialPositionSFEN.STANDARD) {
      position = "startpos";
    } else {
      position = "sfen " + sfen;
    }
    const branches = this.getUSIBranches(record);
    for (const moves of branches) {
      if (moves) {
        await this.fd?.write(position + " moves" + moves + this.appSettings.returnCode);
      } else {
        await this.fd?.write(position + this.appSettings.returnCode);
      }
    }
  }

  getUSIBranches(record: ImmutableRecord): string[] {
    const branches: string[] = [];
    let moves = "";
    let p: ImmutableNode = record.first;
    const pos = record.initialPosition.clone();
    const stack: [ImmutableNode, string][] = [];
    while (true) {
      if (p.next) {
        stack.push([p, moves]);
        if (p.move instanceof Move) {
          pos.doMove(p.move);
          moves += " " + p.move.usi;
        }
        p = p.next;
        continue;
      }
      if (p.move instanceof Move) {
        branches.push(moves + " " + p.move.usi);
      } else if (this.appSettings.enableUSIFileResign && p.move.type === SpecialMoveType.RESIGN) {
        branches.push(moves + " resign");
      } else {
        branches.push(moves);
      }
      while (!p.branch) {
        const last = stack.pop();
        if (!last) {
          return branches;
        }
        if (last[0].move instanceof Move) {
          pos.undoMove(last[0].move);
        }
        p = last[0];
        moves = last[1];
      }
      p = p.branch;
    }
  }
}
