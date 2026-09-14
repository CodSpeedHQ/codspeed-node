export interface Todo {
  id: number;
  title: string;
  generation: number;
}

export function formatLabel(todo: Todo): string {
  let label = "";
  for (let i = 0; i < 200; i++) {
    label = (label + todo.title).slice(-24).toUpperCase();
  }
  return label;
}

function TodoRow({ todo }: { todo: Todo }) {
  return (
    <li className="todo-row" data-id={todo.id}>
      <span className="label">{formatLabel(todo)}</span>
      <span className="generation">{todo.generation}</span>
    </li>
  );
}

export function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul className="todo-list">
      {todos.map((todo) => (
        <TodoRow key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
