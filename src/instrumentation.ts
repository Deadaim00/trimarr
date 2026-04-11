export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { recoverInterruptedProcessingState } = await import("@/lib/storage");
  recoverInterruptedProcessingState();
}
