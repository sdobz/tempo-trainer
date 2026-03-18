/// <reference lib="dom" />
import "../component/setup-dom.ts"; // Setup DOM environment first
import { assertEquals } from "../base/assert.ts";

// ---------------------------------------------------------------------------
// Minimal concrete component for testing
// ---------------------------------------------------------------------------

const { default: BaseComponent } = await import("./base-component.js");

class TestComponent extends BaseComponent {
  override getTemplateUrl() {
    return "/src/features/base/app-notification.html"; // borrow any existing template
  }
  override getStyleUrl() {
    return "/src/features/base/app-notification.css";
  }
}

if (!customElements.get("test-component-base")) {
  customElements.define("test-component-base", TestComponent);
}

async function createComponent(): Promise<InstanceType<typeof TestComponent>> {
  const el = document.createElement("test-component-base") as InstanceType<
    typeof TestComponent
  >;
  document.body.appendChild(el);
  await el.componentReady;
  return el;
}

// ---------------------------------------------------------------------------
// listen() — auto cleanup
// ---------------------------------------------------------------------------

Deno.test("BaseComponent: listen() binds event listener", async () => {
  const el = await createComponent();
  let fired = false;
  const btn = document.createElement("button");

  el.listen(btn, "click", () => {
    fired = true;
  });
  btn.click();

  assertEquals(fired, true);
});

Deno.test("BaseComponent: listen() removes listener on unmount", async () => {
  const el = await createComponent();
  let fired = false;
  const btn = document.createElement("button");

  el.listen(btn, "click", () => {
    fired = true;
  });

  // Unmount
  document.body.removeChild(el);

  fired = false;
  btn.click();

  assertEquals(fired, false);
});

Deno.test(
  "BaseComponent: listen() returned cleanup function works immediately",
  async () => {
    const el = await createComponent();
    let fired = false;
    const btn = document.createElement("button");

    const cleanup = el.listen(btn, "click", () => {
      fired = true;
    });
    cleanup();
    btn.click();

    assertEquals(fired, false);
  },
);

// ---------------------------------------------------------------------------
// emit()
// ---------------------------------------------------------------------------

Deno.test(
  "BaseComponent: emit() dispatches a CustomEvent that bubbles",
  async () => {
    const el = await createComponent();
    let receivedDetail: any = null;

    document.body.addEventListener("test-event", (e: Event) => {
      receivedDetail = (e as CustomEvent).detail;
    });

    el.emit("test-event", { value: 42 });

    assertEquals(receivedDetail?.value, 42);
  },
);

Deno.test("BaseComponent: emit() works without detail", async () => {
  const el = await createComponent();
  let fired = false;
  document.body.addEventListener("bare-event", () => {
    fired = true;
  });
  el.emit("bare-event");
  assertEquals(fired, true);
});

// ---------------------------------------------------------------------------
// onShow() / onHide()
// ---------------------------------------------------------------------------

Deno.test(
  "BaseComponent: onShow and onHide are callable virtual methods",
  async () => {
    const el = await createComponent();
    let showCalled = false;
    let hideCalled = false;

    el.onShow = () => {
      showCalled = true;
    };
    el.onHide = () => {
      hideCalled = true;
    };

    el.onShow();
    el.onHide();

    assertEquals(showCalled, true);
    assertEquals(hideCalled, true);
  },
);

// ---------------------------------------------------------------------------
// AbortController — initialization
// ---------------------------------------------------------------------------

Deno.test(
  "BaseComponent: _initAbortController exists on instance",
  async () => {
    const el = await createComponent();
    assertEquals(el._initAbortController instanceof AbortController, true);
  },
);

// ---------------------------------------------------------------------------
// Reactive helpers
// ---------------------------------------------------------------------------

Deno.test("BaseComponent: createEffect runs immediately", async () => {
  const el = await createComponent();
  const [getCount, setCount] = el.createSignalState(0);
  const seen: number[] = [];

  const dispose = el.createEffect(() => {
    seen.push(getCount());
  });

  setCount(1);

  assertEquals(seen, [0, 1]);
  dispose();
});

Deno.test(
  "BaseComponent: createEffect is disposed automatically on unmount",
  async () => {
    const el = await createComponent();
    const [getCount, setCount] = el.createSignalState(0);
    const seen: number[] = [];

    el.createEffect(() => {
      seen.push(getCount());
    });

    // Unmount triggers _runCleanups(), which should dispose the effect.
    document.body.removeChild(el);
    setCount(1);

    assertEquals(seen, [0]);
  },
);

Deno.test(
  "BaseComponent: createEffect cleanup callback runs on unmount",
  async () => {
    const el = await createComponent();
    const [getCount, setCount] = el.createSignalState(0);
    let cleanupCount = 0;

    el.createEffect(() => {
      getCount();
      return () => {
        cleanupCount += 1;
      };
    });

    setCount(1);
    document.body.removeChild(el);

    // One cleanup for re-run, one cleanup for dispose on unmount.
    assertEquals(cleanupCount, 2);
  },
);
