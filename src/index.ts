import { cloneDeep, uniqueId } from 'lodash';
import { diff as jsonDiff, formatters as jsonFormatter } from 'jsondiffpatch';
import randomId from 'random-id';
import stackTrace from 'stacktrace-js';
import StackFrame = StackTrace.StackFrame;
import PQueue from 'promise-queue';

type ExtractAllSAMActionRequestDefinitionFields<A> = {
  [K in Extract<keyof A, keyof SAMActionRequestDefinition>]: A[K];
};

interface SAMIdentity {
  readonly id: string;
}

export interface SAMStateDefinition extends SAMIdentity {}

interface RestrictActions<ALL_ACTION_PARAM_TYPE extends SAMActionRequestDefinition> {
  type: 'disallow' | 'strictly-allow';
  actions: ExtractAllSAMActionRequestDefinitionFields<ALL_ACTION_PARAM_TYPE>[];
}

type StateRestrictions<ALL_ACTION_PARAM_TYPE extends SAMActionRequestDefinition> = RestrictActions<
  ALL_ACTION_PARAM_TYPE
>;

interface SAMState<
  MODEL_TYPE,
  ALL_ACTION_PARAM_TYPE extends SAMActionRequestDefinition,
  ALL_STATES extends SAMStateDefinition
> {
  readonly state: ALL_STATES;
  isState: (params: { model: Readonly<MODEL_TYPE> }) => boolean;
  nextActionPredicate?: (params: { model: Readonly<MODEL_TYPE> }) => { action: ALL_ACTION_PARAM_TYPE } | undefined;
  restrictions?: StateRestrictions<ALL_ACTION_PARAM_TYPE>;
}

interface SAMAction<PROPOSAL_TYPE extends SAMProposalDefinition, ALL_ACTION_PARAM_TYPE extends SAMActionRequestDefinition> {
  createProposal: (params: { action: ALL_ACTION_PARAM_TYPE }) => Promise<PROPOSAL_TYPE | undefined>;
}

type SAMSettings = { type: 'debug' };

interface RegistrationConfig<
  MODEL_TYPE extends object,
  PROPOSAL_TYPE extends SAMProposalDefinition,
  ALL_ACTION_PARAM_TYPE extends SAMActionRequestDefinition,
  ALL_STATES extends SAMStateDefinition
> {
  model: MODEL_TYPE;
  actions: SAMAction<PROPOSAL_TYPE, ALL_ACTION_PARAM_TYPE>;
  presenter: (param: { proposal: Readonly<PROPOSAL_TYPE>; model: MODEL_TYPE }) => MODEL_TYPE | undefined;
  stateDefinitions: SAMState<MODEL_TYPE, ALL_ACTION_PARAM_TYPE, ALL_STATES>[];
  subscriptions: Subscription<MODEL_TYPE, ALL_STATES>[];
  settings?: SAMSettings;
}

type ActionExecutor<ALL_ACTION_PARAM_TYPE extends SAMActionRequestDefinition> = (param: {
  action: ALL_ACTION_PARAM_TYPE;
}) => Promise<void>;

export interface SAMActionRequestDefinition extends SAMIdentity {}

export interface SAMProposalDefinition extends SAMIdentity {}

class ActionChecker<
  MODEL_TYPE extends object,
  PROPOSAL_TYPE extends SAMProposalDefinition,
  REPRESENTATION_TYPE,
  ALL_ACTION_PARAM_TYPE extends SAMActionRequestDefinition,
  ALL_STATES extends SAMStateDefinition
> {
  constructor(
    private action: ALL_ACTION_PARAM_TYPE,
    private state: SAMState<MODEL_TYPE, ALL_ACTION_PARAM_TYPE, ALL_STATES>
  ) {}
  isActionDisallowed(): boolean {
    if (this.state.restrictions) {
      if (this.state.restrictions.type === 'disallow') {
        for (let disallowedAction of this.state.restrictions.actions) {
          if (disallowedAction.id === this.action.id) {
            return true;
          }
        }
      } else if (this.state.restrictions.type === 'strictly-allow') {
        for (let allowedActions of this.state.restrictions.actions) {
          if (allowedActions.id === this.action.id) {
            return false;
          }
        }
        return true;
      }
    }

    return false;
  }
}

type SAMStepSnapshot<
  MODEL_TYPE extends object,
  PROPOSAL_TYPE extends SAMProposalDefinition,
  ALL_ACTION_PARAM_TYPE extends SAMActionRequestDefinition,
  ALL_STATES extends SAMStateDefinition
> =
  | { readonly type: 'constructor-model'; initialModel: MODEL_TYPE }
  | { readonly type: 'action'; action: ALL_ACTION_PARAM_TYPE; fromState: ALL_STATES | null }
  | { readonly type: 'disallow-action-proposal'; action: ALL_ACTION_PARAM_TYPE; state: ALL_STATES }
  | { readonly type: 'proposal'; proposal: PROPOSAL_TYPE; action: ALL_ACTION_PARAM_TYPE }
  | { readonly type: 'no-proposal'; action: ALL_ACTION_PARAM_TYPE }
  | { readonly type: 'mutation'; oldModel: MODEL_TYPE; newModel: MODEL_TYPE; diffString: string }
  | { readonly type: 'no-model'; proposal: PROPOSAL_TYPE; model: MODEL_TYPE }
  | { readonly type: 'state'; model: MODEL_TYPE; state: ALL_STATES }
  | { readonly type: 'no-state'; model: MODEL_TYPE };

interface SAMHistory<
  MODEL_TYPE extends object,
  PROPOSAL_TYPE extends SAMProposalDefinition,
  ALL_ACTION_PARAM_TYPE extends SAMActionRequestDefinition,
  ALL_STATES extends SAMStateDefinition
> {
  id: string;
  snapshot: SAMStepSnapshot<MODEL_TYPE, PROPOSAL_TYPE, ALL_ACTION_PARAM_TYPE, ALL_STATES>;
  session: SAMLoopSession;
  timestamp: Date;
  callstack: Promise<StackFrame[]>;
}

// Session is defined by a complete SAM loop until the last next-action finishes.
class SAMLoopSession {
  id: string;

  constructor({ id }: { id: string }) {
    this.id = id;
  }
}

class SAMLoopHistory<
  MODEL_TYPE extends object,
  PROPOSAL_TYPE extends SAMProposalDefinition,
  ALL_ACTION_PARAM_TYPE extends SAMActionRequestDefinition,
  ALL_STATES extends SAMStateDefinition
> {
  histories: SAMHistory<MODEL_TYPE, PROPOSAL_TYPE, ALL_ACTION_PARAM_TYPE, ALL_STATES>[];
  settings: SAMSettings | null;
  printQueue: PQueue;
  constructor({ settings }: { settings: SAMSettings | null }) {
    this.histories = [];
    this.settings = settings;
    this.printQueue = new PQueue(1);
  }

  private printHistoryAsync({
    history,
  }: {
    history: SAMHistory<MODEL_TYPE, PROPOSAL_TYPE, ALL_ACTION_PARAM_TYPE, ALL_STATES>;
  }) {
    this.printQueue.add(() => {
      return new Promise((resolve) => {
        history.callstack.then((stack) => {
          console.log(history.snapshot);
          resolve();
        });
      });
    });
  }

  add({
    snapshot,
    session,
  }: {
    snapshot: SAMStepSnapshot<MODEL_TYPE, PROPOSAL_TYPE, ALL_ACTION_PARAM_TYPE, ALL_STATES>;
    session: SAMLoopSession;
  }) {
    if (this.settings && this.settings.type === 'debug') {
      const stack = stackTrace.get();
      const history = {
        snapshot: mutationProtection(snapshot),
        session,
        id: generateUniqueID(),
        timestamp: new Date(),
        callstack: stack,
      };
      this.histories.push(history);

      this.printHistoryAsync({ history });
    }
  }

  getStack() {
    return this.histories;
  }
}

type Subscription<MODEL_TYPE extends object, ALL_STATES extends SAMStateDefinition> = {
  afterNewState: (arg: { model: Readonly<MODEL_TYPE>; state: Readonly<ALL_STATES> }) => void;
};

function generateUniqueID() {
  return uniqueId();
}

const LOWER_ALPHABET_UPPER_ALPHABET_NUMBERS_ONLY = 'Aa0';
function generateSessionID() {
  return randomId(5, LOWER_ALPHABET_UPPER_ALPHABET_NUMBERS_ONLY);
}

const mutationProtection = (o: any) => cloneDeep(o);

export class SAM<
  MODEL_TYPE extends object,
  PROPOSAL_TYPE extends SAMProposalDefinition,
  ALL_ACTION_PARAM_TYPE extends SAMActionRequestDefinition,
  ALL_STATES extends SAMStateDefinition
> {
  private subscriptions: Subscription<MODEL_TYPE, ALL_STATES>[];
  private currentStateDefinition: SAMState<MODEL_TYPE, ALL_ACTION_PARAM_TYPE, ALL_STATES>;
  private model: MODEL_TYPE;
  private globalHistories: SAMLoopHistory<MODEL_TYPE, PROPOSAL_TYPE, ALL_ACTION_PARAM_TYPE, ALL_STATES>;
  private readonly initialModel: MODEL_TYPE;
  private readonly initialState: ALL_STATES;
  constructor(
    private config: Readonly<RegistrationConfig<MODEL_TYPE, PROPOSAL_TYPE, ALL_ACTION_PARAM_TYPE, ALL_STATES>>
  ) {
    this.config = mutationProtection(this.config);

    this.subscriptions = this.config.subscriptions;
    this.model = this.config.model;
    this.initialModel = mutationProtection(this.config.model);

    const session = new SAMLoopSession({ id: generateSessionID() });
    this.globalHistories = new SAMLoopHistory({ settings: this.config.settings || null });
    this.globalHistories.add({
      snapshot: {
        type: 'constructor-model',
        initialModel: this.config.model,
      },
      session,
    });

    const stateDef = this.matchState({ model: this.model });
    if (!stateDef) {
      throw Error('Please pass in an initial model that evaluates to a State.');
    }
    this.initialState = mutationProtection(stateDef.state);
    this.currentStateDefinition = stateDef;

    this.globalHistories.add({
      snapshot: {
        type: 'state',
        model: this.model,
        state: stateDef.state,
      },
      session,
    });

    this.afterNewState({ model: this.model, session });
  }

  public getInitialModel() {
    return mutationProtection(this.initialModel);
  }

  public getInitialState() {
    return mutationProtection(this.initialState);
  }

  public subscribe = (definition: Subscription<MODEL_TYPE, ALL_STATES>) => {
    if (this.subscriptions.find((subscription) => subscription === definition)) {
      return;
    }

    this.subscriptions.push(definition);
  };

  public unsubscribe = (definition: Subscription<MODEL_TYPE, ALL_STATES>) => {
    const matchingDef = this.subscriptions.findIndex((subscription) => subscription === definition);
    if (matchingDef !== -1) {
      this.subscriptions.splice(matchingDef, 1);
    }
  };

  private blockAction = ({ action, session }: { action: ALL_ACTION_PARAM_TYPE; session: SAMLoopSession }) => {
    if (this.currentStateDefinition) {
      const actionChecker = new ActionChecker(action, this.currentStateDefinition);
      if (actionChecker.isActionDisallowed()) {
        this.globalHistories.add({
          snapshot: {
            type: 'disallow-action-proposal',
            action,
            state: this.currentStateDefinition.state,
          },
          session,
        });
        throw Error(`Blocked action. "${action.id}" action blocked, given state "${this.currentStateDefinition.state.id}".`);
      }
    }
  };

  private SAMLoop = async ({
    action,
    session,
    fromState,
  }: {
    action: ALL_ACTION_PARAM_TYPE;
    session: SAMLoopSession;
    fromState: ALL_STATES | null;
  }) => {
    this.blockAction({ action, session });

    this.globalHistories.add({
      snapshot: {
        type: 'action',
        action,
        fromState,
      },
      session,
    });

    const proposal = await this.config.actions.createProposal({ action: mutationProtection(action) });

    if (!proposal) {
      this.globalHistories.add({
        snapshot: {
          type: 'no-proposal',
          action,
        },
        session,
      });
      return;
    }

    this.globalHistories.add({
      snapshot: {
        type: 'proposal',
        action: action,
        proposal: proposal,
      },
      session,
    });

    this.blockAction({ action, session });

    const oldModel: MODEL_TYPE = mutationProtection(this.model);
    const model = this.config.presenter({
      proposal: mutationProtection(proposal),
      model: mutationProtection(this.model),
    });

    if (!model) {
      this.globalHistories.add({
        snapshot: {
          type: 'no-model',
          model: this.model,
          proposal,
        },
        session,
      });
      return;
    }
    this.model = model;

    const modelDiff = jsonDiff(oldModel, model);
    this.globalHistories.add({
      snapshot: {
        type: 'mutation',
        oldModel: oldModel,
        newModel: model,
        diffString: modelDiff ? jsonFormatter.console.format(modelDiff, oldModel) : '',
      },
      session,
    });

    const stateDef = this.matchState({ model });

    if (!stateDef) {
      this.globalHistories.add({
        snapshot: {
          type: 'no-state',
          model: this.model,
        },
        session,
      });
      return;
    }
    this.currentStateDefinition = stateDef;

    this.globalHistories.add({
      snapshot: {
        type: 'state',
        model: this.model,
        state: this.currentStateDefinition.state,
      },
      session,
    });

    this.afterNewState({ model, session });
  };

  public execute: ActionExecutor<ALL_ACTION_PARAM_TYPE> = async ({ action }) => {
    const session = new SAMLoopSession({ id: generateSessionID() });
    this.SAMLoop({ action, session, fromState: null });
  };

  private matchState = ({
    model,
  }: {
    model: MODEL_TYPE;
  }): SAMState<MODEL_TYPE, ALL_ACTION_PARAM_TYPE, ALL_STATES> | null => {
    for (let stateDefinition of this.config.stateDefinitions) {
      if (stateDefinition.isState({ model: mutationProtection(model) })) {
        return stateDefinition;
      }
    }

    return null;
  };

  private afterNewState = ({ model, session }: { session: SAMLoopSession; model: MODEL_TYPE }) => {
    for (let subscription of this.subscriptions) {
      subscription.afterNewState({
        state: this.currentStateDefinition.state,
        model,
      });
    }

    if (this.currentStateDefinition.nextActionPredicate) {
      const nextPredicate = this.currentStateDefinition.nextActionPredicate({
        model: mutationProtection(model),
      });
      if (nextPredicate) {
        this.SAMLoop({ action: nextPredicate.action, session, fromState: this.currentStateDefinition.state });
      }
    }
  };
}
