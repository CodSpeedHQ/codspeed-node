import { tryIntrospect } from "../../../dist/index.cjs.js";

tryIntrospect();
console.log(JSON.stringify(process.execArgv));
