import { expect, test, vi } from "vitest";

vi.mock("../components/ui/components/button.tsx", () => ({ Button: "button" }));

const { toast } = await import("../components/ui/components/toast.tsx");

test("shared notifications preserve IDs, urgency, timeouts, actions, and dismiss through Base UI", () => {
  const events = [];
  const unsubscribe = toast[" subscribe"]((event) => events.push(event));
  try {
    let undone = 0;
    const cancel = { label: "Open Trash", onClick() {} };
    const id = toast.success("Moved to trash", {
      id: "post-1",
      description: "Your content is retained.",
      duration: 10000,
      closeButton: true,
      action: {
        label: "Undo",
        onClick() {
          undone++;
        },
      },
      cancel,
    });
    expect(id).toBe("post-1");
    expect(events[0].options.title).toBe("Moved to trash");
    expect(events[0].options.description).toBe("Your content is retained.");
    expect(events[0].options.timeout).toBe(10000);
    expect(events[0].options.priority).toBe("low");
    expect(events[0].options.data).toEqual({ closeButton: true, cancel });
    events[0].options.actionProps.onClick({ defaultPrevented: false });
    expect(undone).toBe(1);
    expect(events.at(-1)).toEqual({ action: "close", options: { id } });
    events[0].options.actionProps.onClick({ defaultPrevented: true });
    expect(events.length).toBe(2);
    toast.error("Retry this operation", { id, duration: 6000 });
    expect(events.at(-1).options.id).toBe(id);
    expect(events.at(-1).options.priority).toBe("high");
    expect(events.at(-1).options.type).toBe("error");
    toast.dismiss(id);
    expect(events.at(-1)).toEqual({ action: "close", options: { id } });
    toast.dismiss();
    expect(events.at(-1)).toEqual({ action: "close", options: { id: undefined } });
  } finally {
    unsubscribe();
  }
});
