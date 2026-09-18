import { flushPromises, shallowMount, VueWrapper } from "@vue/test-utils";
import AppSettingsDialog from "@/renderer/view/dialog/AppSettingsDialog.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import api, { isMobileWebApp, isNative } from "@/renderer/ipc/api.js";
import { useAppSettings } from "@/renderer/store/settings.js";
import { defaultAppSettings } from "@/common/settings/app.js";

const { closeAppSettingsDialog } = vi.hoisted(() => ({ closeAppSettingsDialog: vi.fn() }));
vi.mock("@/renderer/store", () => ({
  useStore: () => ({ closeAppSettingsDialog }),
}));
vi.mock("@/renderer/ipc/api.js");
// jsdom does not render modal dialogs; keep the real dialog and hotkey components.
vi.mock("@/renderer/helpers/dialog", () => ({
  showModalDialog: vi.fn((dialog: HTMLDialogElement) => dialog.setAttribute("open", "")),
}));

describe("AppSettingsDialog/analysisCopyPrompt", () => {
  let wrapper: VueWrapper | undefined;

  beforeEach(async () => {
    vi.mocked(isNative).mockReturnValue(true);
    vi.mocked(isMobileWebApp).mockReturnValue(false);
    vi.mocked(api.getVersionStatus).mockResolvedValue({ updatedMs: 0 });
    await useAppSettings().updateAppSettings(defaultAppSettings());
    vi.clearAllMocks();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  const openSettings = async () => {
    wrapper = shallowMount(AppSettingsDialog, {
      attachTo: document.body,
      global: { stubs: { DialogFrame: false } },
    });
    wrapper.findComponent(HorizontalSelector).vm.$emit("update:value", "evaluation");
    await flushPromises();
    return wrapper;
  };

  it("edits and saves a multiline prompt and shows it when reopened", async () => {
    const dialog = await openSettings();
    const input = dialog.get<HTMLTextAreaElement>("#analysis-copy-prompt");
    expect(input.isVisible()).toBe(true);
    expect(input.element.value).toBe(defaultAppSettings().analysisCopyPrompt);
    const prompt = "局面を解説してください。\n各候補を比較してください。";
    await input.setValue(prompt);
    await dialog.get('[data-hotkey="Enter"]').trigger("click");
    await flushPromises();
    expect(api.saveAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ analysisCopyPrompt: prompt }),
    );
    expect(closeAppSettingsDialog).toHaveBeenCalledOnce();
    dialog.unmount();
    wrapper = undefined;
    const reopened = await openSettings();
    expect(reopened.get<HTMLTextAreaElement>("#analysis-copy-prompt").element.value).toBe(prompt);
  });

  it("discards prompt changes when cancelled", async () => {
    const dialog = await openSettings();
    await dialog.get("#analysis-copy-prompt").setValue("保存しない変更");
    await dialog.get('[data-hotkey="Escape"]').trigger("click");
    expect(closeAppSettingsDialog).toHaveBeenCalledOnce();
    expect(api.saveAppSettings).not.toHaveBeenCalled();
    dialog.unmount();
    wrapper = undefined;
    expect(useAppSettings().analysisCopyPrompt).toBe(defaultAppSettings().analysisCopyPrompt);
  });

  it("allows Enter in the prompt without triggering Save and Close", async () => {
    const dialog = await openSettings();
    const input = dialog.get<HTMLTextAreaElement>("#analysis-copy-prompt");
    input.element.focus();
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    input.element.dispatchEvent(event);
    await flushPromises();
    expect(event.defaultPrevented).toBe(false);
    expect(api.saveAppSettings).not.toHaveBeenCalled();
    expect(closeAppSettingsDialog).not.toHaveBeenCalled();
  });
});
