/** Test stand-in for `expo-constants`: a standalone (App Store / TestFlight) build. */
export const ExecutionEnvironment = { Bare: "bare", Standalone: "standalone", StoreClient: "storeClient" } as const;
export default { executionEnvironment: ExecutionEnvironment.Standalone };
