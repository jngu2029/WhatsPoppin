// Synchronous guard: React state alone cannot block two taps in one render.
export function submissionGuard() {
  let running = false;
  return {
    enter() { if (running) return false; running = true; return true; },
    release() { running = false; },
  };
}
