import { useEffect, type PropsWithChildren } from "react";
import { MobileDeviceProvider, useMobileDevice } from "./Device";
import { KeyboardDock, KeyboardProvider, useKeyboard } from "./Keyboard";
import { PhoneFrame } from "./PhoneFrame";
import { HomeIndicator, StatusBar } from "./components";

export function MobileRuntime({ children }: PropsWithChildren) {
  return (
    <MobileDeviceProvider>
      <PhoneFrame>
        <KeyboardProvider>
          <KeyboardPreview />
          <StatusBar />
          <MobileAppViewport>{children}</MobileAppViewport>
          <HomeIndicator />
          <KeyboardDock />
        </KeyboardProvider>
      </PhoneFrame>
    </MobileDeviceProvider>
  );
}

/**
 * Keeps the original v2.1 flow, scrolling, and navigation runtime while
 * removing preview-only phone chrome for the Windows application.
 */
export function FramelessMobileRuntime({ children }: PropsWithChildren) {
  return (
    <MobileDeviceProvider>
      <KeyboardProvider>
        <div className="frameless-runtime" data-testid="frameless-runtime">
          <div
            className="mobile-app-viewport"
            data-keyboard-visible="false"
            data-platform="ios"
            data-testid="mobile-app-viewport"
          >
            {children}
          </div>
        </div>
      </KeyboardProvider>
    </MobileDeviceProvider>
  );
}

function MobileAppViewport({ children }: PropsWithChildren) {
  const { device } = useMobileDevice();
  const keyboard = useKeyboard();

  return (
    <div
      className="mobile-app-viewport"
      data-keyboard-visible={keyboard.visible ? "true" : "false"}
      data-platform={device.platform}
      data-testid="mobile-app-viewport"
    >
      {children}
    </div>
  );
}

function KeyboardPreview() {
  const keyboard = useKeyboard();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("keyboard") === "1") {
      keyboard.show();
    }
  }, [keyboard]);

  return null;
}
