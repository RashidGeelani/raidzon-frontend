type WidgetResult =
  string | { message?: string; token?: string; accessToken?: string; 'access-token'?: string };
type WidgetWindow = Window & { initSendOTP?: (config: Record<string, unknown>) => void };
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
