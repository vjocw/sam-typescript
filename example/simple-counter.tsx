import { SAM, SAMActionRequestDefinition, SAMProposalDefinition, SAMStateDefinition } from '../src/index';
import React from 'react';
import ReactDOM from 'react-dom';

// Model definition
interface SimpleCounterModel {
  count: number;
}

// Action definition
class ChangeCountAction implements SAMActionRequestDefinition {
  readonly id = 'change-count-action';
  constructor(readonly count: number) {}
}

// Proposal Definition
class ChangeCountProposal implements SAMProposalDefinition {
  readonly id = 'change-count-proposal';
  constructor(readonly count: number) {}
}

// State definitions
class ShowCountState implements SAMStateDefinition {
  readonly id = 'show-count';
}

class MaxCountState implements SAMStateDefinition {
  readonly id = 'max-count';
}
// End of State definitions

type AllActions = ChangeCountAction;
type AllProposals = ChangeCountProposal;
type AllStates = ShowCountState | MaxCountState;

const COUNT_MAX = 10;

// start
const sam = new SAM<SimpleCounterModel, AllActions, AllProposals, AllStates>({
  model: { // pass in initial model
    count: 0,
  },
  actions: {
    // sam.execute({action}) will pass through here
    async createProposal({ action }) {
      switch (action.id) {
        case 'change-count-action':
          return new ChangeCountProposal(action.count);
      }
    },
  },
  // all proposals will pass through here.
  presenter: ({ model, proposal }) => {
    if (proposal.id === 'change-count-proposal' && proposal.count >= 0 && proposal.count <= COUNT_MAX) {
      model.count = proposal.count;
    }

    return model;
  },
  // define states - sam-typescript will match for the first true 'isState'
  stateDefinitions: [
    {
      state: { id: 'show-count' },
      isState: ({ model }) => {
        return model.count < COUNT_MAX;
      },
    },
    {
      state: { id: 'max-count' },
      isState: ({ model }) => {
        return model.count === COUNT_MAX;
      },
    },
  ],
  // settings: { type: 'debug' },
  subscriptions: [{ afterNewState: represent }], // after each state, define a function to run. 
});

// the representation here is based on React but it can be anything from a graphical output to a server response.
function represent({ model, state }: { model: SimpleCounterModel; state: AllStates }) {
  let representation;

  switch (state.id) {
    case 'show-count':
      representation = (
        <div>
          <div>count is {model.count}</div>
          <button onClick={() => sam.execute({ action: new ChangeCountAction(model.count + 1) })}>increase</button>
          <button onClick={() => sam.execute({ action: new ChangeCountAction(model.count - 1) })}>decrease</button>
        </div>
      );
      break;
    case 'max-count':
      representation = (
        <div>
          <div>count has reached its max at: {model.count}</div>
          <button onClick={() => sam.execute({ action: new ChangeCountAction(model.count - 1) })}>decrease</button>
        </div>
      );
      break;
    default:
      const _exhaustiveCheck: never = state;
  }

  ReactDOM.render(representation, document.getElementById('root'));
}
