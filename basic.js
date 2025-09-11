async function another_function() {
  console.trace();
  let acc = 0;
  for (let i = 0; i < 100; i++) {
    for (let i = 0; i < 500; i++) {
      acc += Math.sqrt(i);
    }

    if (i % 10 === 0) {
      console.log(i);
    }
  }

  return Promise.resolve(acc);
}

async function __codspeed_root_frame__() {
  let acc = await another_function();
  return acc;
}

__codspeed_root_frame__();
