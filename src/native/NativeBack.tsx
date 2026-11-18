// Android back button support for the screens. Harmless elsewhere: without the Android app nothing
// ever calls nativeBack.handleBack().
import { useEffect, useRef, type RefObject } from "react";
import type { FlowControls } from "../mobile";
import { nativeBack } from "./bridge";

/** Keeps the back button pointed at the screen stack. Render it in every screen header and the home footer. */
export function NativeBackFlow({ flow }: { flow: FlowControls }) {
  useEffect(() => {
    nativeBack.setFlow(flow);
  });
  return null;
}

/**
 * While `open` is true, the back button calls `close` instead of leaving the screen. `anchor` is an
 * element inside the screen: screens further down the stack stay mounted, and an overlay left open
 * there must not swallow the back button of the screen on top.
 */
export function useNativeBackOverlay(open: boolean, close: () => void, anchor: RefObject<HTMLElement | null>) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return undefined;
    return nativeBack.pushOverlay(
      () => closeRef.current(),
      () => Boolean(anchor.current?.closest('[data-flow-current="true"]')),
    );
  }, [open, anchor]);
}
