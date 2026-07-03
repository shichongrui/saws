export const retryUntil = async (
  callback: () => Promise<boolean>,
  timeout: number
) => {
  while (true) {
    const done = await callback();
    if (done) break;
    await new Promise((r) => setTimeout(r, timeout));
  }
  return;
};
