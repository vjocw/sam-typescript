import { SAM, SAMActionRequestDefinition, SAMProposalDefinition, SAMStateDefinition } from '../src/index';
import React from 'react';
import ReactDOM from 'react-dom';

interface SimpleCounterModel {
  count: number;
}

class ChangeCountAction implements SAMActionRequestDefinition {
  readonly id = 'change-count-action';
  constructor(readonly count: number) {}
}

class ChangeCountProposal implements SAMProposalDefinition {
  readonly id = 'change-count-proposal';
  constructor(readonly count: number) {}
}

class ShowCountState implements SAMStateDefinition {
  readonly id = 'show-count';
}

class MaxCountState implements SAMStateDefinition {
  readonly id = 'max-count';
}

type AllActions = ChangeCountAction;
type AllProposals = ChangeCountProposal;
type AllStates = ShowCountState | MaxCountState;

const COUNT_MAX = 10;

const sam = new SAM<SimpleCounterModel, AllProposals, AllActions, AllStates>({
  model: {
    count: 0,
  },
  actions: {
    async createProposal({ action }) {
      switch (action.id) {
        case 'change-count-action':
          return new ChangeCountProposal(action.count);
      }
    },
  },
  presenter: ({ model, proposal }) => {
    if (proposal.id === 'change-count-proposal' && proposal.count >= 0 && proposal.count <= COUNT_MAX) {
      model.count = proposal.count;
    }

    return model;
  },
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
  subscriptions: [{ afterNewState: represent }],
});

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
