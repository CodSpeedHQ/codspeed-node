import { bench } from "@codspeed/vitest-plugin/browser";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { TodoList, type Todo } from "./todoList";

const TODO_COUNT = 400;

const titles = Array.from(
  { length: TODO_COUNT },
  (_, id) => `task number ${id}`,
);
const container = document.createElement("div");
document.body.appendChild(container);
const root = createRoot(container);
let generation = 0;

bench("render 400 rows", () => {
  generation += 1;
  const todos: Todo[] = titles.map((title, id) => ({ id, title, generation }));
  flushSync(() => {
    root.render(<TodoList todos={todos} />);
  });
});
