export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { recoverInterruptedProcessingState, runStartupMaintenance } = await import("@/lib/storage");
  runStartupMaintenance();
  await recoverInterruptedProcessingState();
}
