/**
 * Global test teardown
 * Runs once after all tests
 */

export default async () => {
  // Cleanup code here if needed
  await new Promise((resolve) => setTimeout(resolve, 500));
};
