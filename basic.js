// Helper function for 1-second busy wait
function busyWait() {
  const start = Date.now();
  while (Date.now() - start < 1000) {
    // Busy wait for 1 second
    Math.random();
  }
}

// Helper function for 1-second async wait
function asyncWait() {
  console.log("In asyncWait");
  console.trace();
  return new Promise((resolve) => setTimeout(resolve, 1000));
}

// Function 'a' - busy wait and async wait, then call 'b'
async function a() {
  console.log("Function a starting");
  busyWait();
  await asyncWait();
  await b();
  console.log("Function a finished");
}

// Function 'b' - busy wait and async wait, then call 'c'
async function b() {
  console.log("Function b starting");
  busyWait();
  await asyncWait();
  await c();
  console.log("Function b finished");
}

// Function 'c' - busy wait and async wait, then call 'd'
async function c() {
  console.log("Function c starting");
  busyWait();
  await asyncWait();
  await d();
  console.log("Function c finished");
}

// Function 'd' - busy wait and async wait (leaf function)
async function d() {
  console.log("Function d starting");
  busyWait();
  await asyncWait();
  console.log("Function d finished");
}

// Main function - entry point
async function main() {
  console.log("Starting profiling test");
  console.log(
    "Each function will busy wait for 1 second and async wait for 1 second"
  );

  const start = Date.now();
  await a();
  const end = Date.now();

  console.log(`Total time: ${(end - start) / 1000}s`);
  console.log("Profiling test completed");
}

// Run the main function
if (require.main === module) {
  main().catch(console.error);
}
