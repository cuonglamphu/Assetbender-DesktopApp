export function listen(
  _event: string,
  _handler: (event: { payload: unknown }) => void,
): Promise<() => void> {
  return Promise.resolve(() => {});
}
