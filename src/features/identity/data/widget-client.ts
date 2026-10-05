type WidgetResult =
  string | { message?: string; token?: string; accessToken?: string; 'access-token'?: string };
type WidgetCallback = (data: unknown) => void;
type WidgetWindow = Window & {
  initSendOTP?: (config: Record<string, unknown>) => void;
  sendOtp?: (identifier: string, success?: WidgetCallback, failure?: WidgetCallback) => void;
  retryOtp?: (channel: string, success?: WidgetCallback, failure?: WidgetCallback, reqId?: string) => void;
  verifyOtp?: (otp: number | string, success?: WidgetCallback, failure?: WidgetCallback, reqId?: string) => void;
  isCaptchaVerified?: () => boolean;
};
let loading: Promise<void> | undefined;
async function loadWidget() {
  if ((window as WidgetWindow).initSendOTP) return;
  loading ??= (async () => {
    for (const src of [
      'https://verify.msg91.com/otp-provider.js',
      'https://verify.phone91.com/otp-provider.js',
    ]) {
      try {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          const timer = setTimeout(() => {
            script.remove();
            reject(new Error('Widget loading timed out.'));
          }, 15000);
          script.src = src;
          script.async = true;
          script.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          script.onerror = () => {
            clearTimeout(timer);
            script.remove();
            reject(new Error('Widget could not load.'));
          };
          document.head.appendChild(script);
        });
        if ((window as WidgetWindow).initSendOTP) return;
      } catch {
        /* Try the provider's fallback host. */
      }
    }
    throw new Error('Phone verification could not load. Check your connection and try again.');
  })().catch((error) => {
    loading = undefined;
    throw error;
  });
  await loading;
}
export async function verifyWithWidget(): Promise<string> {
  const widgetId = import.meta.env.VITE_MSG91_WIDGET_ID;
  const tokenAuth = import.meta.env.VITE_MSG91_WIDGET_TOKEN_AUTH;
  if (!widgetId || !tokenAuth) throw new Error('Phone verification is not configured.');
  await loadWidget();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Verification timed out. Please try again.')),
      300000,
    );
    preparedFor = null; // the popup replaces any custom-UI setup
    (window as WidgetWindow).initSendOTP!({
      widgetId,
      tokenAuth,
      exposeMethods: false,
      success: (data: WidgetResult) => {
        clearTimeout(timer);
        const token =
          typeof data === 'string'
            ? data
            : (data?.['access-token'] ?? data?.accessToken ?? data?.token ?? data?.message);
        if (typeof token !== 'string' || !token || token.length > 16384)
          reject(new Error('Invalid verification response.'));
        else resolve(token);
      },
      failure: () => {
        clearTimeout(timer);
        reject(new Error('Phone verification failed. Please try again.'));
      },
    });
  });
}

/*
 * Our own sign-in screen on top of MSG91 ("custom UI" mode: exposeMethods). MSG91 still sends
 * the SMS with its approved template; the app only draws the form. The access token MSG91 returns
 * is verified by our backend exactly like the popup's.
 */
let preparedFor: string | null = null;

function widgetConfig() {
  const widgetId = import.meta.env.VITE_MSG91_WIDGET_ID;
  const tokenAuth = import.meta.env.VITE_MSG91_WIDGET_TOKEN_AUTH;
  if (!widgetId || !tokenAuth) throw new Error('Phone verification is not configured.');
  return { widgetId, tokenAuth };
}

/** A short, human message from a widget failure, or the fallback. */
export function widgetError(error: unknown, fallback: string): Error {
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';
  return new Error(message && message.length <= 120 ? message : fallback);
}

/** The value a widget success callback carries: a request ID after sending, an access token after verifying. */
export function widgetValue(data: unknown): string | undefined {
  const value =
    typeof data === 'string'
      ? data
      : data && typeof data === 'object'
        ? ((data as Record<string, unknown>)['access-token'] ??
          (data as Record<string, unknown>).accessToken ??
          (data as Record<string, unknown>).token ??
          (data as Record<string, unknown>).reqId ??
          (data as Record<string, unknown>).message)
        : undefined;
  return typeof value === 'string' && value && value.length <= 16384 ? value : undefined;
}

/**
 * Loads MSG91 in custom-UI mode and draws its "I am human" check into the element with this ID.
 * Returns false when custom mode isn't available, so the caller can fall back to the popup.
 */
export async function prepareWidget(captchaRenderId: string): Promise<boolean> {
  const config = widgetConfig();
  await loadWidget();
  const w = window as WidgetWindow;
  if (preparedFor !== captchaRenderId) {
    w.initSendOTP!({
      ...config,
      exposeMethods: true,
      captchaRenderId,
      // Results come back through the per-call callbacks below.
      success: () => undefined,
      failure: () => undefined,
    });
    preparedFor = captchaRenderId;
  }
  // The methods appear once the provider has initialised.
  for (let i = 0; i < 50 && !(w.sendOtp && w.verifyOtp); i++) await new Promise((r) => setTimeout(r, 100));
  return !!(w.sendOtp && w.verifyOtp);
}
/** Forget the prepared widget (the form that held its captcha was closed). */
export function releaseWidget(captchaRenderId: string) {
  if (preparedFor === captchaRenderId) preparedFor = null;
}

/** False while the "I am human" check is shown and not yet ticked. */
export function widgetCaptchaReady(): boolean {
  const check = (window as WidgetWindow).isCaptchaVerified;
  try {
    return check ? check() !== false : true;
  } catch {
    return true;
  }
}

function call<T>(start: (success: WidgetCallback, failure: WidgetCallback) => void, read: (data: unknown) => T, fallback: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Phone verification timed out. Please try again.')), 60000);
    try {
      start(
        (data) => {
          clearTimeout(timer);
          try {
            resolve(read(data));
          } catch (error) {
            reject(error);
          }
        },
        (error) => {
          clearTimeout(timer);
          reject(widgetError(error, fallback));
        },
      );
    } catch (error) {
      clearTimeout(timer);
      reject(widgetError(error, fallback));
    }
  });
}

/** Texts a code to this number (E.164, e.g. +919876543210). Returns MSG91's request ID if it gives one. */
export function widgetSendCode(phone: string): Promise<string | undefined> {
  const identifier = phone.replace(/^\+/, '');
  return call((ok, fail) => (window as WidgetWindow).sendOtp!(identifier, ok, fail), widgetValue, 'The code could not be sent. Please try again.');
}

/** Sends the code again by SMS. */
export function widgetResendCode(reqId?: string): Promise<void> {
  return call((ok, fail) => (window as WidgetWindow).retryOtp!('11', ok, fail, reqId), () => undefined, 'The code could not be sent again. Please wait a moment and try again.');
}

/** Checks the code with MSG91 and returns the access token for our backend. */
export function widgetVerifyCode(code: string, reqId?: string): Promise<string> {
  return call(
    (ok, fail) => (window as WidgetWindow).verifyOtp!(code, ok, fail, reqId),
    (data) => {
      const token = widgetValue(data);
      if (!token) throw new Error('Invalid verification response.');
      return token;
    },
    'That code didn’t match. Check the SMS and try again.',
  );
}
