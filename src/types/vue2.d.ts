declare module "vue" {
  export type DefineComponent<
    Props = Record<string, unknown>,
    RawBindings = Record<string, unknown>,
    Data = unknown
  > = unknown;

  const Vue: unknown;
  export default Vue;
}
