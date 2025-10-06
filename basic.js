// basic.js

function busySleep(ms) {
  let now = performance.now();
  let heartbeat = now + 50;
  const end = now + ms;
  while (now < end) {
    if (now > heartbeat) {
      console.log("heartbeat");
      heartbeat = now + 200;
    }

    now = performance.now();
  }
}

function waterMark() {
  const end = performance.now() + 50;
  while (performance.now() < end) {
    // Busy wait
  }
  console.log("Hello this is a watermark");
}

function a() {
  for (let i = 0; i < 10; i++) {
    busySleep(100);
  }
}

function parent_1() {
  console.log("In parent_1");
  const end = performance.now() + 50;
  while (performance.now() < end) {
    // Busy wait
  }
  a();
}

function parent_2() {
  console.log("In parent_2");
  const end = performance.now() + 50;
  while (performance.now() < end) {
    // Busy wait
  }
  a();
}

function root_function() {
  parent_1();
  for (let i = 0; i < 10; i++) {
    waterMark();
  }
  parent_2();
}

%PrepareFunctionForOptimization(root_function);
root_function();
%OptimizeFunctionOnNextCall(root_function);
root_function();

waterMark();
root_function();
