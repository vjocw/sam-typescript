SAM Typescript 

State Management made Scalable. Save yourself from state management hell. 

Based on Jean-Jacques Dubray's SAM programming model (http://sam.js.org/). All credits go to him for this brilliant model. 
For a Javascript implementation please see: https://www.npmjs.com/package/sam-pattern. 

In SAM (State Action Model architecture), the following is the process.

```
Action -> Proposals -> Model Mutation -> State -> (Optionally) Next Action
```

So let's create a simple counter state machine. A counter state machine can be in 2 conceptual states: when the machine is counting and when it is done. This can be expressed as: 

```
State = ShowCountState | MaxCountState
```

1. Define your states:
Define your states as classes one property 'id' and as readonly. This is required. 
```typescript
import { SAMStateDefinition } from 'sam-typescript';

class ShowCountState implements SAMStateDefinition {
  readonly id = 'show-count';
}

class MaxCountState implements SAMStateDefinition {
  readonly id = 'max-count';
}

type AllStates = ShowCountState | MaxCountState;
```

2. Define your model:
A model is the global object you will need to mutate. Define this in your typescript file using an interface. 
```typescript
interface SimpleCounterModel {
  count: number;
}
```

3. Define your actions that you will call to create a proposal: 
```typescript
import { SAMActionRequestDefinition } from 'sam-typescript';

class ChangeCountAction implements SAMActionRequestDefinition {
  readonly id = 'change-count-action';
  constructor(readonly count: number) {}
}

type AllActions = ChangeCountAction; // for this example, one is all of them.
```

4. Define any proposal that an action could create: 
```typescript
import { SAMProposalDefinition } from 'sam-typescript';

class ChangeCountProposal implements SAMProposalDefinition {
  readonly id = 'change-count-proposal';
  constructor(readonly count: number) {}
}

type AllProposals = ChangeCountProposal;
```
5. Define a proposal creator
```typescript
const createProposal = async ({action}) => {
    switch (action.id) {
      case 'change-count-action':
        return new ChangeCountProposal(action.count);
    }
}
```

6. Create a model mutator
This will accept a previous model and proposal and mutate the model as necessary. 
```typescript
const presenter = ({ model, proposal }) => {
  if (proposal.id === 'change-count-proposal' && proposal.count >= 0 && proposal.count <= COUNT_MAX) {
    model.count = proposal.count;
  }

  return model;
}
```

7. Create dynamic state evaluation based on the current model:
```typescript
const stateDefinitions = () => [
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
  ];
```

8. Finally instantiate the the SAM instance. 
```typescript
const COUNT_MAX = 10;

const sam = new SAM<SimpleCounterModel, AllActions, AllProposals, AllStates>({
  model: { 
    count: 0,
  },
  actions: {
    createProposal
  },
  presenter,
  stateDefinitions,
  subscriptions: [{ afterNewState: ({model,state}) => console.log(model,state)}],
});
```

9. Call 'execute' to call any action:
This will start the loop and end up with state. 
```typescript
sam.execute({ action: new ChangeCountAction(model.count - 1) })
```

Here is an example with React: 
```typescript
import React from 'react';
import ReactDOM from 'react-dom';

// after setting up the above
const sam = new SAM<SimpleCounterModel, AllActions, AllProposals, AllStates>({
  model: { 
    count: 0,
  },
  actions: {
    createProposal
  },
  presenter,
  stateDefinitions,
  subscriptions: [{ afterNewState: represent }], // change subscription to call represent instead of 'console.log'. 
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
```


For a slightly more complicated example, please see 'rocket-launcher.tsx' under the 'example' folder. 