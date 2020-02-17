import { SAM, SAMActionRequestDefinition, SAMProposalDefinition, SAMStateDefinition } from '../src/index';
import React from 'react';
import ReactDOM from 'react-dom';

interface RocketLauncherModel {
  counter: number;
  aborted: boolean;
  started: boolean;
}

// Have individual proposal instead of one global proposal because if an interface has all optionals, it will be treated as 'any'.
// https://github.com/Microsoft/TypeScript/wiki/FAQ#why-are-all-types-assignable-to-empty-interfaces
class AbortProposal implements SAMProposalDefinition {
  readonly id = 'abort';
}

class LaunchProposal implements SAMProposalDefinition {
  readonly id = 'launch';
}

class DecrementCountProposal implements SAMProposalDefinition {
  readonly id = 'decrement-count';
}

class ResetCountdownProposal implements SAMProposalDefinition {
  readonly id = 'reset-countdown';
}

class StartProposal implements SAMProposalDefinition {
  readonly id = 'start';
}

class ResetCountdown implements SAMActionRequestDefinition {
  readonly id = 'reset-countdown';
}

class DecrementCountAction implements SAMActionRequestDefinition {
  readonly id = 'decrement-count';
}

class LaunchAction implements SAMActionRequestDefinition {
  readonly id = 'launch';
}

class AbortAction implements SAMActionRequestDefinition {
  readonly id = 'abort';
}

class StartCountdownAction implements SAMActionRequestDefinition {
  readonly id = 'start-countdown';
}

class ContinueCountdownAction implements SAMActionRequestDefinition {
  readonly id = 'continue-countdown';
}

class ReadyState implements SAMStateDefinition {
  readonly id = 'ready';
}

class CountingState implements SAMStateDefinition {
  readonly id = 'counting';
}

class LaunchedState implements SAMStateDefinition {
  readonly id = 'launched';
}

class AbortedState implements SAMStateDefinition {
  readonly id = 'aborted';
}

type AllActions =
  | StartCountdownAction
  | DecrementCountAction
  | LaunchAction
  | AbortAction
  | ContinueCountdownAction
  | ResetCountdown;
type AllProposals = AbortProposal | LaunchProposal | DecrementCountProposal | ResetCountdownProposal | StartProposal;
type AllStates = ReadyState | CountingState | LaunchedState | AbortedState;

const COUNTER_MAX = 10;

const sam = new SAM<RocketLauncherModel, AllActions, AllProposals, AllStates>({
  model: {
    counter: COUNTER_MAX,
    aborted: false,
    started: false,
  },
  actions: {
    async createProposal({ action }) {
      switch (action.id) {
        case 'start-countdown':
          return new StartProposal();
        case 'decrement-count':
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return new DecrementCountProposal();
        case 'launch':
          return new LaunchProposal();
        case 'abort':
          return new AbortProposal();
        case 'continue-countdown':
          return new DecrementCountProposal();
        case 'reset-countdown':
          return new ResetCountdownProposal();
        default:
          const _exhaustiveCheck: never = action;
      }
    },
  },
  presenter: ({ model, proposal }) => {
    if (proposal.id === 'start') {
      model.started = true;
    }

    if (proposal.id === 'reset-countdown') {
      model.counter = COUNTER_MAX;
      model.aborted = false;
      model.started = false;
    }

    if (proposal.id === 'decrement-count' && model.counter - 1 >= 0) {
      model.counter = model.counter - 1;
      model.aborted = false;
    }

    if (proposal.id === 'abort') {
      model.aborted = true;
    }

    return model;
  },
  stateDefinitions: [
    {
      state: { id: 'ready' },
      isState: ({ model }) => {
        return model.counter === COUNTER_MAX && !model.aborted && !model.started;
      },
      restrictions: {
        type: 'strictly-allow',
        actions: [{ id: 'start-countdown' }],
      },
    },
    {
      state: { id: 'counting' },
      isState: ({ model }) => {
        return model.counter <= COUNTER_MAX && model.counter > 0 && !model.aborted && model.started;
      },
      nextActionPredicate: ({ model }) => {
        if (model.counter > 0) {
          return {
            action: new DecrementCountAction(),
          };
        } else if (model.counter === 0) {
          return {
            action: new LaunchAction(),
          };
        }
      },
    },
    {
      state: { id: 'launched' },
      isState: ({ model }) => {
        return model.counter === 0 && model.started && !model.aborted;
      },
      restrictions: {
        type: 'disallow',
        actions: [{ id: 'decrement-count' }],
      },
    },
    {
      state: { id: 'aborted' },
      isState: ({ model }) => {
        return model.counter <= COUNTER_MAX && model.counter >= 0 && model.aborted;
      },
      restrictions: {
        type: 'strictly-allow',
        actions: [{ id: 'continue-countdown' }],
      },
    },
  ],
  // settings: { type: 'debug' },
  subscriptions: [{ afterNewState: represent }],
});

function represent({ model, state }: { model: RocketLauncherModel; state: AllStates }) {
  let representation;

  switch (state.id) {
    case 'ready':
      representation = (
        <div>
          <div>READY TO LAUNCH {model.counter}</div>
          <button onClick={() => sam.execute({ action: new StartCountdownAction() })}>LAUNCH BUTTON!</button>
        </div>
      );
      break;
    case 'counting':
      representation = (
        <div>
          counting<div>{model.counter}</div>
          <button onClick={() => sam.execute({ action: new AbortAction() })}>abort</button>
          <button onClick={() => sam.execute({ action: new ResetCountdown() })}>reset</button>
        </div>
      );
      break;
    case 'launched':
      representation = (
        <div>
          launched!<div>{model.counter}</div>
          <button onClick={() => sam.execute({ action: new ResetCountdown() })}>reset countdown</button>
        </div>
      );
      break;
    case 'aborted':
      representation = (
        <div>
          aborted!<div>{model.counter}</div>
          <button onClick={() => sam.execute({ action: new ContinueCountdownAction() })}>continue</button>
        </div>
      );
      break;
    default:
      const _exhaustiveCheck: never = state;
  }

  ReactDOM.render(representation, document.getElementById('root'));
}
