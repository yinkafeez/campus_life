import QuizView from "./QuizView";
import OrderingView from "./OrderingView";
import MatchingView from "./MatchingView";
import ScenarioView from "./ScenarioView";
import WrittenView from "./WrittenView";
import { countWords } from "./words";

/*
 * One view per server engine. A view gets { view, value, onChange, disabled } and edits the
 * answer object the engine expects; `ready` says when the answer can be submitted.
 * New engine on the server → add its view here.
 */
export const FORMATS = {
  quiz: {
    View: QuizView,
    ready: (view, value) => view.questions.every((q) => value?.answers?.[q.id]),
  },
  ordering: {
    View: OrderingView,
    // the shuffled order is already a valid answer
    initial: (view) => ({ order: view.items.map((i) => i.id) }),
    ready: () => true,
  },
  matching: {
    View: MatchingView,
    ready: (view, value) => view.left.every((l) => value?.matches?.[l.id]),
  },
  scenario: {
    View: ScenarioView,
    ready: (view, value) => view.steps.every((s) => value?.choices?.[s.id]),
  },
  written: {
    View: WrittenView,
    initial: () => ({ text: "" }),
    ready: (view, value) => {
      const words = countWords(value?.text);
      return words >= view.minWords && words <= view.maxWords;
    },
  },
};
