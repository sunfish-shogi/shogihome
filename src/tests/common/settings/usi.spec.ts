import {
  duplicateEngine,
  exportUSIEnginesForCLI,
  getUSIEngineOptionCurrentValue,
  importUSIEnginesForCLI,
  mergeUSIEngine,
  USIEngineOption,
  USIEngine,
  USIEngines,
  validateUSIEngine,
  compareUSIEngineOptions,
  getUSIEnginePonder,
  getUSIEngineThreads,
  getUSIEngineMultiPV,
  getUSIEngineStochasticPonder,
} from "@/common/settings/usi.js";
import { testUSIEngine } from "@/tests/mock/usi.js";

describe("settings/usi", () => {
  it("getUSIEngineOptionCurrentValue", () => {
    expect(
      getUSIEngineOptionCurrentValue({
        name: "test",
        type: "spin",
        order: 1,
        default: 5,
        min: 0,
        max: 10,
        value: 8,
      }),
    ).toBe(8);
    expect(
      getUSIEngineOptionCurrentValue({
        name: "test",
        type: "spin",
        order: 1,
        default: 5,
        min: 0,
        max: 10,
      }),
    ).toBe(5);
    expect(
      getUSIEngineOptionCurrentValue({
        name: "test",
        type: "string",
        order: 1,
        default: "foo",
        value: "bar",
      }),
    ).toBe("bar");
    expect(
      getUSIEngineOptionCurrentValue({
        name: "test",
        type: "string",
        order: 1,
        default: "foo",
      }),
    ).toBe("foo");
    expect(
      getUSIEngineOptionCurrentValue({
        name: "test",
        type: "string",
        order: 1,
      }),
    ).toBeUndefined();
    expect(
      getUSIEngineOptionCurrentValue({
        name: "test",
        type: "string",
        order: 1,
        default: "<empty>",
      }),
    ).toBe("");
    expect(
      getUSIEngineOptionCurrentValue({
        name: "test",
        type: "filename",
        order: 1,
        default: "<empty>",
      }),
    ).toBe("");
    expect(getUSIEngineOptionCurrentValue(undefined)).toBeUndefined();
  });

  it("getUSIEnginePonder", () => {
    const testCases: { options: { [name: string]: USIEngineOption }; expected: boolean }[] = [
      {
        options: {
          USI_Ponder: {
            name: "USI_Ponder",
            type: "check",
            order: 1,
            default: "true",
            value: "false",
          },
        },
        expected: false,
      },
      {
        options: {
          USI_Ponder: {
            name: "USI_Ponder",
            type: "check",
            order: 1,
            default: "false",
            value: "true",
          },
        },
        expected: true,
      },
      {
        options: {
          USI_Ponder: {
            name: "USI_Ponder",
            type: "check",
            order: 1,
            default: "true",
          },
        },
        expected: true,
      },
      {
        options: {
          Foo: {
            name: "Foo",
            type: "check",
            order: 1,
            default: "true",
            value: "false",
          },
        },
        expected: false,
      },
    ];
    for (const testCase of testCases) {
      const engine: USIEngine = {
        uri: "dummy",
        options: testCase.options,
      } as USIEngine;
      expect(getUSIEnginePonder(engine)).toBe(testCase.expected);
    }
  });

  it("getUSIEngineThreads", () => {
    const testCases: {
      options: { [name: string]: USIEngineOption };
      expected: number | undefined;
    }[] = [
      {
        options: {
          Threads: {
            name: "Threads",
            type: "spin",
            order: 1,
            default: 4,
            value: 2,
          },
        },
        expected: 2,
      },
      {
        options: {
          Threads: {
            name: "Threads",
            type: "spin",
            order: 1,
            default: 4,
          },
        },
        expected: 4,
      },
      {
        options: {
          NumberOfThreads: {
            name: "NumberOfThreads",
            type: "spin",
            order: 1,
            default: 4,
            value: 2,
          },
        },
        expected: 2,
      },
      {
        options: {
          Foo: {
            name: "Foo",
            type: "spin",
            order: 1,
            default: 4,
            value: 2,
          },
        },
        expected: undefined,
      },
    ];
    for (const testCase of testCases) {
      const engine: USIEngine = {
        uri: "dummy",
        options: testCase.options,
      } as USIEngine;
      expect(getUSIEngineThreads(engine)).toBe(testCase.expected);
    }
  });

  it("getUSIEngineMultiPV", () => {
    const testCases: {
      options: { [name: string]: USIEngineOption };
      expected: number | undefined;
    }[] = [
      {
        options: {
          MultiPV: {
            name: "MultiPV",
            type: "spin",
            order: 1,
            default: 4,
            value: 2,
          },
        },
        expected: 2,
      },
      {
        options: {
          MultiPV: {
            name: "MultiPV",
            type: "spin",
            order: 1,
            default: 4,
          },
        },
        expected: 4,
      },
      {
        options: {
          USI_MultiPV: {
            name: "USI_MultiPV",
            type: "spin",
            order: 1,
            default: 4,
            value: 2,
          },
        },
        expected: 2,
      },
      {
        options: {
          Foo: {
            name: "Foo",
            type: "spin",
            order: 1,
            default: 4,
            value: 2,
          },
        },
        expected: undefined,
      },
    ];
    for (const testCase of testCases) {
      const engine: USIEngine = {
        uri: "dummy",
        options: testCase.options,
      } as USIEngine;
      expect(getUSIEngineMultiPV(engine)).toBe(testCase.expected);
    }
  });

  it("getUSIEngineStochasticPonder", () => {
    const testCases: {
      options: { [name: string]: USIEngineOption };
      expected: boolean;
    }[] = [
      {
        options: {
          Stochastic_Ponder: {
            name: "Stochastic_Ponder",
            type: "check",
            order: 1,
            default: "true",
            value: "false",
          },
        },
        expected: false,
      },
      {
        options: {
          Stochastic_Ponder: {
            name: "Stochastic_Ponder",
            type: "check",
            order: 1,
            default: "false",
            value: "true",
          },
        },
        expected: true,
      },
      {
        options: {
          Stochastic_Ponder: {
            name: "Stochastic_Ponder",
            type: "check",
            order: 1,
            default: "true",
          },
        },
        expected: true,
      },
      {
        options: {
          Foo: {
            name: "Foo",
            type: "check",
            order: 1,
            default: "false",
            value: "true",
          },
        },
        expected: false,
      },
    ];
    for (const testCase of testCases) {
      const engine: USIEngine = {
        uri: "dummy",
        options: testCase.options,
      } as USIEngine;
      expect(getUSIEngineStochasticPonder(engine)).toBe(testCase.expected);
    }
  });

  it("duplicateEngine", () => {
    const src: USIEngine = {
      uri: "dummy",
      name: "My Test Engine",
      defaultName: "Test Engine",
      author: "Author",
      path: "/foo/bar/baz",
      options: {
        foo: {
          name: "foo",
          type: "spin",
          order: 1,
          default: 5,
          min: 0,
          max: 10,
          value: 8,
        },
      },
      labels: {},
      enableEarlyPonder: false,
    };
    const out = duplicateEngine(src);
    expect(out.uri).toMatch(/^es:\/\/usi-engine\/.*$/);
    expect(out.name).toBe("My Test Engine のコピー");
    expect(out.defaultName).toBe("Test Engine");
    expect(out.author).toBe("Author");
    expect(out.path).toBe("/foo/bar/baz");
    expect(out.options).toStrictEqual({
      foo: {
        name: "foo",
        type: "spin",
        order: 1,
        default: 5,
        min: 0,
        max: 10,
        value: 8,
      },
    });
    expect(out.options !== src.options).toBeTruthy();
  });

  it("mergeUSIEngine", () => {
    const lhs: USIEngine = {
      uri: "uri-a",
      name: "name-a",
      defaultName: "default-name-a",
      author: "author-a",
      path: "path-a",
      options: {
        foo: {
          name: "foo",
          type: "spin",
          order: 1,
          default: 5,
          min: 0,
          max: 20,
          value: 8,
        },
      },
      labels: {},
      enableEarlyPonder: false,
    };
    const rhs: USIEngine = {
      uri: "uri-b",
      name: "name-b",
      defaultName: "default-name-b",
      author: "author-b",
      path: "path-b",
      options: {
        foo: {
          name: "foo",
          type: "spin",
          order: 1,
          default: 10,
          min: 0,
          max: 25,
          value: 15,
        },
      },
      labels: {
        game: true,
        mate: false,
      },
      enableEarlyPonder: false,
    };
    mergeUSIEngine(lhs, rhs);
    expect(lhs).toStrictEqual({
      uri: "uri-b",
      name: "name-b",
      defaultName: "default-name-a",
      author: "author-a",
      path: "path-a",
      options: {
        foo: {
          name: "foo",
          type: "spin",
          order: 1,
          default: 5,
          min: 0,
          max: 20,
          value: 15,
        },
      },
      labels: {
        game: true,
        mate: false,
      },
      tags: ["対局"],
      enableEarlyPonder: false,
    });
  });

  describe("validate", () => {
    const validUSIPonderOption: USIEngineOption = {
      name: "USI_Ponder",
      type: "check",
      order: 1,
      default: "true",
      value: "false",
    };
    const validUSIHashOption: USIEngineOption = {
      name: "USI_Hash",
      type: "spin",
      order: 2,
      default: 32,
      min: 1,
      value: 128,
    };
    const validStringOption: USIEngineOption = {
      name: "MyString",
      type: "string",
      order: 3,
      default: "default",
      value: "value",
    };
    const validComboOption: USIEngineOption = {
      name: "MyCombo",
      type: "combo",
      order: 4,
      default: "a",
      value: "b",
      vars: ["a", "b", "c"],
    };
    const validComboOption2: USIEngineOption = {
      name: "MyCombo2",
      type: "combo",
      order: 5,
      default: "a",
      value: "x",
      vars: ["a", "b", "c"],
    };
    const validFilenameOption: USIEngineOption = {
      name: "MyFilename",
      type: "filename",
      order: 6,
      default: "<empty>",
      value: "/path/to/file",
    };
    const validButtonOption: USIEngineOption = {
      name: "MyButton",
      type: "button",
      order: 7,
    };

    it("ok", () => {
      expect(
        validateUSIEngine({
          uri: "es://usi-engine/test",
          name: "my engine",
          defaultName: "test engine",
          author: "test author",
          path: "path/to/engine",
          options: {
            USI_Ponder: validUSIPonderOption,
            USI_Hash: validUSIHashOption,
            MyString: validStringOption,
            MyCombo: validComboOption,
            MyCombo2: validComboOption2,
            MyFilename: validFilenameOption,
            MyButton: validButtonOption,
          },
          enableEarlyPonder: false,
        }),
      ).toBeUndefined();
    });

    it("invalid-uri", () => {
      expect(
        validateUSIEngine({
          uri: "es://not-usi-engine/test",
          name: "my engine",
          defaultName: "test engine",
          author: "test author",
          path: "path/to/engine",
          options: {
            USI_Ponder: validUSIPonderOption,
            USI_Hash: validUSIHashOption,
            MyString: validStringOption,
            MyCombo: validComboOption,
            MyCombo2: validComboOption2,
            MyFilename: validFilenameOption,
            MyButton: validButtonOption,
          },
          enableEarlyPonder: false,
        }),
      ).toBeInstanceOf(Error);
    });

    it("invalid-check-option", () => {
      expect(
        validateUSIEngine({
          uri: "es://usi-engine/test",
          name: "my engine",
          defaultName: "test engine",
          author: "test author",
          path: "path/to/engine",
          options: {
            USI_Ponder: {
              name: "USI_Ponder",
              type: "check",
              order: 0,
              default: "true",
              value: "NOT-A-BOOLEAN",
            },
            USI_Hash: validUSIHashOption,
            MyString: validStringOption,
            MyCombo: validComboOption,
            MyCombo2: validComboOption2,
            MyFilename: validFilenameOption,
            MyButton: validButtonOption,
          },
          enableEarlyPonder: false,
        } as unknown as USIEngine),
      ).toBeInstanceOf(Error);
    });

    it("invalid-spin-option", () => {
      expect(
        validateUSIEngine({
          uri: "es://usi-engine/test",
          name: "my engine",
          defaultName: "test engine",
          author: "test author",
          path: "path/to/engine",
          options: {
            USI_Ponder: validUSIPonderOption,
            USI_Hash: {
              name: "USI_Hash",
              type: "spin",
              order: 0,
              default: 32,
              min: 1,
              value: "NOT-A-NUMBER",
            },
            MyString: validStringOption,
            MyCombo: validComboOption,
            MyCombo2: validComboOption2,
            MyFilename: validFilenameOption,
            MyButton: validButtonOption,
          },
          enableEarlyPonder: false,
        } as unknown as USIEngine),
      ).toBeInstanceOf(Error);
    });

    it("invalid-string-option", () => {
      expect(
        validateUSIEngine({
          uri: "es://usi-engine/test",
          name: "my engine",
          defaultName: "test engine",
          author: "test author",
          path: "path/to/engine",
          options: {
            USI_Ponder: validUSIPonderOption,
            USI_Hash: validUSIHashOption,
            MyString: {
              name: "MyString",
              type: "string",
              order: 0,
              default: "default",
              value: 123,
            },
            MyCombo: validComboOption,
            MyCombo2: validComboOption2,
            MyFilename: validFilenameOption,
            MyButton: validButtonOption,
          },
          enableEarlyPonder: false,
        } as unknown as USIEngine),
      ).toBeInstanceOf(Error);
    });
  });

  it("compareUSIEngineOptions", () => {
    const lhs: USIEngine = {
      ...testUSIEngine,
      options: {
        USI_Hash: { name: "USI_Hash", type: "spin", order: 0, default: 32, value: 64 },
        USI_Ponder: { name: "USI_Ponder", type: "check", order: 1, default: "true" },
        Refresh: { name: "Refresh", type: "button", order: 2 },
        Log: { name: "Log", type: "button", order: 3 },
        Book: { name: "Book", type: "filename", order: 4, default: "<empty>", value: "book.db" },
        StringA: { name: "StringA", type: "string", order: 4, value: "foo" },
        StringB: { name: "StringB", type: "string", order: 5, value: "bar" },
        Depth: { name: "Depth", type: "spin", order: 6, default: 1, value: 2 }, // only lhs
        NumberA: { name: "NumberA", type: "spin", order: 7, default: 1, value: 2 },
        NumberB: { name: "NumberB", type: "spin", order: 8, default: 1 }, // default value
        NumberC: { name: "NumberC", type: "spin", order: 9, default: 1, value: 2 },
        NumberD: { name: "NumberD", type: "spin", order: 10, default: 1 }, // default value
      },
    };
    const rhs: USIEngine = {
      ...testUSIEngine,
      options: {
        USI_Hash: { name: "USI_Hash", type: "spin", order: 0, default: 32 }, // no value
        USI_Ponder: { name: "USI_Ponder", type: "check", order: 1, default: "true" }, // equal
        Refresh: { name: "Refresh", type: "button", order: 2 }, // skip
        Log: { name: "Log", type: "check", order: 3, value: "true" }, // different type
        Book: { name: "Book", type: "combo", order: 4, vars: [], value: "standard.db" }, // different type
        StringA: { name: "StringA", type: "string", order: 4, value: "foo" }, // equal
        StringB: { name: "StringB", type: "string", order: 5, value: "baz" }, // different value
        ResignValue: { name: "ResignValue", type: "spin", order: 6, default: 1, value: -3000 }, // only rhs
        NumberA: { name: "NumberA", type: "spin", order: 7, default: 1 }, // default value
        NumberB: { name: "NumberB", type: "spin", order: 8, default: 1, value: 2 },
        NumberC: { name: "NumberC", type: "spin", order: 9, default: 2 }, // default value
        NumberD: { name: "NumberD", type: "spin", order: 10, default: 2, value: 1 },
      },
    };
    const result = compareUSIEngineOptions(lhs, rhs);
    expect(result).toStrictEqual([
      { name: "USI_Hash", leftValue: 64, rightValue: 32, mergeable: true },
      { name: "Log", rightValue: "true", mergeable: false },
      { name: "Book", leftValue: "book.db", rightValue: "standard.db", mergeable: false },
      { name: "StringB", leftValue: "bar", rightValue: "baz", mergeable: true },
      { name: "Depth", leftValue: 2, mergeable: false },
      { name: "NumberA", leftValue: 2, rightValue: 1, mergeable: true },
      { name: "NumberB", leftValue: 1, rightValue: 2, mergeable: true },
      { name: "ResignValue", rightValue: -3000, mergeable: false },
    ]);
  });

  it("USIEngines", () => {
    const engines = new USIEngines(
      JSON.stringify({
        engines: {
          "es://usi-engine/a": {
            uri: "es://usi-engine/a",
            name: "Engine A",
            defaultName: "engine-a",
            author: "author-a",
            path: "path-a",
            options: {},
            labels: {},
          },
        },
      }),
    );
    engines.addEngine({
      uri: "es://usi-engine/b",
      name: "Engine B",
      defaultName: "engine-b",
      author: "author-b",
      path: "path-b",
      options: {},
      labels: {},
      enableEarlyPonder: false,
    });
    expect(engines.hasEngine("es://usi-engine/a")).toBeTruthy();
    expect(engines.hasEngine("es://usi-engine/b")).toBeTruthy();
    expect(engines.hasEngine("es://usi-engine/c")).toBeFalsy();
    expect((engines.getEngine("es://usi-engine/a") as USIEngine).name).toBe("Engine A");
    expect((engines.getEngine("es://usi-engine/b") as USIEngine).name).toBe("Engine B");
    expect(engines.engineList).toHaveLength(2);
    expect(engines.engineList[0].name).toBe("Engine A");
    expect(engines.engineList[1].name).toBe("Engine B");
    expect(JSON.parse(engines.json).engines["es://usi-engine/a"].name).toBe("Engine A");
    expect(JSON.parse(engines.json).engines["es://usi-engine/a"].name).toBe("Engine A");
    expect(JSON.parse(engines.json).engines["es://usi-engine/c"]).toBeUndefined();
    expect(JSON.parse(engines.jsonWithIndent)).toStrictEqual(JSON.parse(engines.json));
    engines.updateEngine({
      uri: "es://usi-engine/a",
      name: "Engine A Updated",
      defaultName: "engine-a",
      author: "author-a",
      path: "path-a",
      options: {},
      labels: {},
      enableEarlyPonder: false,
    });
    expect((engines.getEngine("es://usi-engine/a") as USIEngine).name).toBe("Engine A Updated");
    expect((engines.getEngine("es://usi-engine/b") as USIEngine).name).toBe("Engine B");
    engines.removeEngine("es://usi-engine/b");
    expect(engines.hasEngine("es://usi-engine/a")).toBeTruthy();
    expect(engines.hasEngine("es://usi-engine/b")).toBeFalsy();
  });

  it("USIEngines/labels", () => {
    const engines = new USIEngines(
      JSON.stringify({
        engines: {
          "es://usi-engine/a": {
            labels: {
              game: true,
              research: false,
              mate: true,
            },
          },
          "es://usi-engine/b": {
            labels: {
              game: false,
            },
          },
          "es://usi-engine/c": {},
        },
      }),
    );
    const engineA = engines.getEngine("es://usi-engine/a") as USIEngine;
    expect(engineA.labels).toStrictEqual({
      game: true,
      research: false,
      mate: true,
    });
    const engineB = engines.getEngine("es://usi-engine/b") as USIEngine;
    expect(engineB.labels).toStrictEqual({
      game: false,
      research: true,
      mate: true,
    });
    const engineC = engines.getEngine("es://usi-engine/c") as USIEngine;
    expect(engineC.labels).toStrictEqual({
      game: true,
      research: true,
      mate: true,
    });
  });

  it("USIEngines/tags", () => {
    const engines = new USIEngines(
      JSON.stringify({
        engines: {
          "es://usi-engine/a": {
            tags: ["検討", "NNUE"],
          },
          "es://usi-engine/b": {
            labels: {
              game: true,
              research: false,
              mate: true,
            },
          },
        },
      }),
    );
    expect(engines.getEngine("es://usi-engine/a")?.tags).toStrictEqual(["検討", "NNUE"]);
    expect(engines.getEngine("es://usi-engine/b")?.tags).toStrictEqual(["対局", "詰み探索"]);
    expect(engines.tagList).toHaveLength(4);
    engines.addTag("es://usi-engine/a", "対局");
    engines.addTag("es://usi-engine/b", "DL");
    expect(engines.getEngine("es://usi-engine/a")?.tags).toStrictEqual(["検討", "NNUE", "対局"]);
    expect(engines.getEngine("es://usi-engine/b")?.tags).toStrictEqual(["対局", "詰み探索", "DL"]);
    expect(engines.getEngine("es://usi-engine/a")?.labels).toStrictEqual({
      game: true,
      research: true,
      mate: false,
    });
    expect(engines.getEngine("es://usi-engine/b")?.labels).toStrictEqual({
      game: true,
      research: false,
      mate: true,
    });
    expect(engines.tagList.map((entry) => entry.name)).toStrictEqual([
      "DL",
      "NNUE",
      "対局",
      "検討",
      "詰み探索",
    ]);
    engines.removeTag("es://usi-engine/a", "検討");
    engines.removeTag("es://usi-engine/b", "詰み探索");
    expect(engines.getEngine("es://usi-engine/a")?.tags).toStrictEqual(["NNUE", "対局"]);
    expect(engines.getEngine("es://usi-engine/b")?.tags).toStrictEqual(["対局", "DL"]);
    expect(engines.getEngine("es://usi-engine/a")?.labels).toStrictEqual({
      game: true,
      research: false,
      mate: false,
    });
    expect(engines.getEngine("es://usi-engine/b")?.labels).toStrictEqual({
      game: true,
      research: false,
      mate: false,
    });
    expect(engines.tagList).toHaveLength(3);
  });

  it("USIEngines/exportUSIEnginesForCLI", () => {
    expect(
      exportUSIEnginesForCLI({
        uri: "es://usi-engine/test-engine",
        name: "My Test Engine",
        defaultName: "Test Engine",
        author: "Kubo, Ryosuke",
        path: "/path/to/engine",
        options: {
          USI_Ponder: { name: "USI_Ponder", type: "check", order: 1, default: "true" },
          ClearCache: { name: "ClearCache", type: "button", order: 2 },
          BookFile: {
            name: "BookFile",
            type: "filename",
            order: 3,
            default: "book.db",
            value: "path/to/book.db",
          },
          Threads: { name: "Threads", type: "spin", order: 4, default: 1, min: 1, value: 2 },
          LogFileName: {
            name: "LogFileName",
            type: "string",
            order: 5,
            default: "log.txt",
            value: "usi.log",
          },
          JishogiRule: {
            name: "JishogiRule",
            type: "combo",
            order: 6,
            default: "standard24",
            value: "standard27",
            vars: ["standard24", "standard27", "try"],
          },
        },
        labels: {},
        enableEarlyPonder: true,
      }),
    ).toEqual({
      name: "My Test Engine",
      path: "/path/to/engine",
      options: {
        USI_Ponder: { type: "check", value: true },
        BookFile: { type: "filename", value: "path/to/book.db" },
        Threads: { type: "spin", value: 2 },
        LogFileName: { type: "string", value: "usi.log" },
        JishogiRule: { type: "combo", value: "standard27" },
      },
      enableEarlyPonder: true,
    });
  });

  it("USIEngines/importUSIEnginesForCLI", () => {
    const result = importUSIEnginesForCLI({
      name: "My Test Engine",
      path: "/path/to/engine",
      options: {
        USI_Ponder: { type: "check", value: true },
        BookFile: { type: "filename", value: "path/to/book.db" },
        Threads: { type: "spin", value: 2 },
        LogFileName: { type: "string", value: "usi.log" },
        JishogiRule: { type: "combo", value: "standard27" },
      },
      enableEarlyPonder: true,
    });
    expect(result.uri).match(/^es:\/\/usi-engine\/.*$/);
    result.uri = "";
    expect(result).toEqual({
      uri: "",
      name: "My Test Engine",
      defaultName: "My Test Engine",
      author: "",
      path: "/path/to/engine",
      options: {
        USI_Ponder: { name: "USI_Ponder", type: "check", order: 0, value: "true" },
        BookFile: { name: "BookFile", type: "filename", order: 0, value: "path/to/book.db" },
        Threads: { name: "Threads", type: "spin", order: 0, value: 2 },
        LogFileName: { name: "LogFileName", type: "string", order: 0, value: "usi.log" },
        JishogiRule: {
          name: "JishogiRule",
          type: "combo",
          order: 0,
          value: "standard27",
          vars: ["standard27"],
        },
      },
      labels: {},
      enableEarlyPonder: true,
    });
  });
});
