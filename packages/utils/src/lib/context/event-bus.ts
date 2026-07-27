// Generic EventBus types with selector support and state management
// This constrains EventMap to have string keys and non-any values
type EventMap = Record<string, unknown>

// Ensure payload is properly typed (not any)
type Listener<T> = (payload: T) => void

// Simple callback type for unsubscribing
type Unsubscribe = () => void

// Selector function to filter events
type Selector<T> = (payload: T) => boolean

// These constrain state and return types to be proper non-any types
type StateSelector<S extends object, R> = (state: S) => R
type StateUpdater<S extends object> = (prevState: S) => S

// Define a state change event that will be added to Events when state is present
type StateChangeEvent<S extends object> = {
  prevState: S
  nextState: S
}

// Define two separate return types - one with state and one without
type EventBusWithState<Events extends EventMap, S extends object> = {
  on: <T extends keyof Events>(
    eventType: T,
    listener: Listener<Events[T]>
  ) => Unsubscribe
  onWithSelector: <T extends keyof Events>(
    eventType: T,
    selector: Selector<Events[T]>,
    listener: Listener<Events[T]>
  ) => Unsubscribe
  emit: <T extends keyof Events>(eventType: T, payload: Events[T]) => void
  getState: () => S
  setState: (updater: StateUpdater<S>) => void
  subscribe: <R>(
    selector: StateSelector<S, R>,
    listener: (selectedState: R, prevSelectedState: R) => void
  ) => Unsubscribe
}

type EventBusWithoutState<Events extends EventMap> = {
  on: <T extends keyof Events>(
    eventType: T,
    listener: Listener<Events[T]>
  ) => Unsubscribe
  onWithSelector: <T extends keyof Events>(
    eventType: T,
    selector: Selector<Events[T]>,
    listener: Listener<Events[T]>
  ) => Unsubscribe
  emit: <T extends keyof Events>(eventType: T, payload: Events[T]) => void
}

// Conditional return type based on initialState
export function createEventBus<Events extends EventMap>(
  initialState?: undefined
): EventBusWithoutState<Events>
export function createEventBus<Events extends EventMap, S extends object>(
  initialState: S
): EventBusWithState<Events & { "state:changed": StateChangeEvent<S> }, S>

// Implementation
export function createEventBus<
  Events extends EventMap,
  S extends object = never,
>(
  initialState?: S
):
  | EventBusWithoutState<Events>
  | EventBusWithState<Events & { "state:changed": StateChangeEvent<S> }, S> {
  // Enhanced listener structure to support selectors
  type EventListener<T> = {
    callback: Listener<T>
    selector?: Selector<T>
  }

  // Use a Map to store all event listeners with their optional selectors
  const listeners = new Map<
    keyof Events,
    Set<EventListener<Events[keyof Events]>>
  >()

  // State management implementation
  let currentState = initialState
  const stateListeners = new Set<{
    selector: StateSelector<NonNullable<S>, unknown>
    listener: (selected: unknown, prevSelected: unknown) => void
    memoizedValue: unknown
  }>()

  // Subscribe to an event (without selector)
  function on<T extends keyof Events>(
    eventType: T,
    listener: Listener<Events[T]>
  ): Unsubscribe {
    return registerListener(eventType, listener)
  }

  // Subscribe to an event with a selector
  function onWithSelector<T extends keyof Events>(
    eventType: T,
    selector: Selector<Events[T]>,
    listener: Listener<Events[T]>
  ): Unsubscribe {
    return registerListener(eventType, listener, selector)
  }

  // Helper function to register listeners with or without selectors
  function registerListener<T extends keyof Events>(
    eventType: T,
    callback: Listener<Events[T]>,
    selector?: Selector<Events[T]>
  ): Unsubscribe {
    if (!listeners.has(eventType)) {
      listeners.set(eventType, new Set())
    }

    // Type assertion is safe because we just ensured the Set exists
    const eventListeners = listeners.get(eventType)!

    // Create listener object with optional selector
    const listenerObj = {
      callback: callback as Listener<Events[keyof Events]>,
      selector: selector as Selector<Events[keyof Events]> | undefined,
    }

    // Add to the set
    eventListeners.add(listenerObj)

    // Return unsubscribe function
    return () => {
      const currentListeners = listeners.get(eventType)
      if (currentListeners) {
        // Find and remove the specific listener object
        currentListeners.forEach((l) => {
          if (
            l.callback === listenerObj.callback &&
            l.selector === listenerObj.selector
          ) {
            currentListeners.delete(l)
          }
        })
      }
    }
  }

  // Emit an event - now checks selectors before calling listeners
  function emit<T extends keyof Events>(
    eventType: T,
    payload: Events[T]
  ): void {
    const eventListeners = listeners.get(eventType)
    if (eventListeners) {
      eventListeners.forEach((listenerObj) => {
        const { callback, selector } = listenerObj

        // Only invoke the callback if there's no selector or the selector returns true
        if (!selector || (selector as Selector<Events[T]>)(payload)) {
          ;(callback as Listener<Events[T]>)(payload)
        }
      })
    }
  }

  // State management methods (only active if initialState was provided)
  function getState(): S {
    if (currentState === undefined) {
      throw new Error("getState called but no initial state was provided")
    }
    return currentState
  }

  function setState(updater: StateUpdater<S>): void {
    if (currentState === undefined) {
      throw new Error("setState called but no initial state was provided")
    }

    const nextState = updater(getState())

    const prevState = getState()
    currentState = nextState

    // Notify all state subscribers when their selected slice changes
    stateListeners.forEach((entry) => {
      const nextSelectedValue = entry.selector(getState())

      // Only notify if the selected value has changed
      if (nextSelectedValue !== entry.memoizedValue) {
        const prevSelectedValue = entry.memoizedValue
        entry.memoizedValue = nextSelectedValue
        entry.listener(nextSelectedValue, prevSelectedValue)
      }
    })

    // Emit a state change event with proper typing
    const stateChangeEvent = {
      prevState,
      nextState,
    } as unknown as Events[keyof Events]

    emit("state:changed", stateChangeEvent)
  }

  function subscribe<R>(
    selector: StateSelector<NonNullable<S>, R>,
    listener: (selected: R, prevSelected: R) => void
  ): Unsubscribe {
    if (currentState === undefined) {
      throw new Error("subscribe called but no initial state was provided")
    }

    const entry = {
      selector,
      listener,
      memoizedValue: selector(currentState),
    }

    // Type assertion necessary due to variance issues with generic Set
    stateListeners.add(
      entry as {
        selector: StateSelector<NonNullable<S>, unknown>
        listener: (selected: unknown, prevSelected: unknown) => void
        memoizedValue: unknown
      }
    )

    return () => {
      stateListeners.delete(entry as any) // Need to cast due to Set type variance
    }
  }

  // Return the appropriate interface based on whether state was provided
  if (initialState === undefined) {
    return { on, onWithSelector, emit }
  }
  return {
    on,
    onWithSelector,
    emit,
    getState,
    setState,
    subscribe,
  }
}

/**
 * Example Usage:
 *
 *
 *

// Example 1: Event bus with selector support
type NotificationEventPayloads = {
  "notification:show": { message: string; type: "success" | "error" | "info"; category?: string }
  "notification:hide": { id: string }
  "notification:clear": undefined
    "state:changed": { prevState: any; nextState: any } // Auto-added when using state
}

export const notificationEvents = createEventBus<NotificationEventPayloads>()

  // Example 2: Event bus with state management
  type ShoppingCartState = {
items: Array<{ id: string; name: string; price: number; quantity: number }>
         totalItems: number
         totalPrice: number
  }

type CartEventPayloads = {
  "cart:itemAdded": { item: ShoppingCartState["items"][0] }
  "cart:itemRemoved": { itemId: string }
  "cart:cleared": undefined
    "cart:checkout": { paymentMethod: string }
  "state:changed": { prevState: ShoppingCartState; nextState: ShoppingCartState }
}

// Initialize with state
export const cartEvents = createEventBus<CartEventPayloads, ShoppingCartState>({
items: [],
totalItems: 0,
totalPrice: 0
})

// Hook for the notification system with selector support
type NotificationHookOptions = {
  onShow?: (message: string, type: "success" | "error" | "info", category?: string) => void
    onHide?: (id: string) => void
    onClear?: () => void
    // New options for filtering
    onlyShowTypes?: Array<"success" | "error" | "info">
    onlyCategories?: Array<string>
}

import { useEffect } from "react"

export function useSubscribeToNotificationEvents({
    onShow,
    onHide,
    onClear,
    onlyShowTypes,
    onlyCategories,
    }: NotificationHookOptions): void {
  useEffect(() => {
      const unsubscribers: Array<Unsubscribe> = [];

      if (onShow) {
      // If we have type or category filters, use the selector version
      if (onlyShowTypes?.length || onlyCategories?.length) {
      const unsubShow = notificationEvents.onWithSelector(
          "notification:show",
          ({ type, category }) => {
          // Check if the type matches our filter (if we have one)
          const typeMatches = !onlyShowTypes?.length || onlyShowTypes.includes(type);

          // Check if the category matches our filter (if we have one)
          const categoryMatches = !onlyCategories?.length || 
          (category && onlyCategories.includes(category));

          return typeMatches && categoryMatches;
          },
          ({ message, type, category }) => onShow(message, type, category)
          );
      unsubscribers.push(unsubShow);
      } else {
        // Otherwise use the regular subscription
        const unsubShow = notificationEvents.on(
            "notification:show",
            ({ message, type, category }) => onShow(message, type, category)
            );
        unsubscribers.push(unsubShow);
      }
      }

      if (onHide) {
        const unsubHide = notificationEvents.on(
            "notification:hide", 
            ({ id }) => onHide(id)
            );
        unsubscribers.push(unsubHide);
      }

      if (onClear) {
        const unsubClear = notificationEvents.on(
            "notification:clear", 
            () => onClear()
            );
        unsubscribers.push(unsubClear);
      }

      // Clean up all subscriptions
      return () => {
        unsubscribers.forEach(unsub => unsub());
      }
  }, [onShow, onHide, onClear, onlyShowTypes, onlyCategories]);
}

// Example 3: Task management with state and events
type Task = {
id: string;
title: string;
priority: number;
          assignee?: string;
completed: boolean;
}

type TasksState = {
tasks: Record<string, Task>;
loading: boolean;
activeFilter: 'all' | 'high' | 'low';
}

type TaskEventPayloads = {
  "task:created": { task: Task }
  "task:updated": { id: string; changes: Partial<Task> }
  "task:deleted": { id: string }
  "task:statusChanged": { id: string; completed: boolean }
  "state:changed": { prevState: TasksState; nextState: TasksState }
}

// Create task manager with state management and events
export const taskManager = createEventBus<TaskEventPayloads, TasksState>({
tasks: {},
loading: false,
activeFilter: 'all'
});

// Example React hook for tasks with both state and events
import { useState, useEffect } from "react"

// Hook to subscribe to high-priority tasks assigned to a specific user
export function useHighPriorityTasksFor(userId: string): {
tasks: Array<Task>;
addTask: (task: Omit<Task, "id" | "completed">) => void;
completeTask: (taskId: string) => void;
} {
  // Local state to hold filtered tasks
  const [highPriorityTasks, setHighPriorityTasks] = useState<Array<Task>>([]);

  useEffect(() => {
      // Subscribe to state changes using selector to filter high priority tasks for this user
      const unsubState = taskManager.subscribe(
          (state) => {
          // Extract and filter tasks from state
          return Object.values(state.tasks).filter(
              task => task.priority > 8 && task.assignee === userId && !task.completed
              );
          },
          (filteredTasks) => {
          // Update local state when filtered tasks change
          setHighPriorityTasks(filteredTasks);
          }
          );

      // Also listen for specific task events with this user
      const unsubCreate = taskManager.onWithSelector(
          "task:created",
          (payload) => payload.task.priority > 8 && payload.task.assignee === userId,
          ({ task }) => {
          // You could handle this specifically if needed, but state subscription already covers it
          console.log(`New high priority task assigned to ${userId}: ${task.title}`);
          }
          );

      return () => {
        unsubState();
        unsubCreate();
      };
  }, [userId]);

  // Function to add a new task
  const addTask = (taskData: Omit<Task, "id" | "completed">) => {
    const newTask: Task = {
      ...taskData,
      id: `task-${Date.now()}`,
      completed: false
    };

    // Update state
    taskManager.setState((state) => ({
          ...state,
          tasks: {
          ...state.tasks,
          [newTask.id]: newTask
          }
          }));

    // Emit event
    taskManager.emit("task:created", { task: newTask });
  };

  // Function to complete a task
  const completeTask = (taskId: string) => {
    taskManager.setState((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;

      return {
        ...state,
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            completed: true
          }
        }
      };
    });

    // Emit event
    taskManager.emit("task:statusChanged", { id: taskId, completed: true });
  };

  return {
    tasks: highPriorityTasks,
    addTask,
    completeTask
  };
  }

  // Example hook showing how to use both state and events for cart management
  export function useShoppingCart() {
    // Get initial cart state
    const [cart, setCart] = useState(() => cartEvents.getState());

    useEffect(() => {
      // Subscribe to cart state changes
      return cartEvents.subscribe(
        state => state, // Get the whole state
          newCartState => setCart(newCartState)
      );
    }, []);

    // Helper functions that update state and emit events
    const addItem = (item: Omit<ShoppingCartState["items"][0], "quantity">) => {
      // Update state
      cartEvents.setState(state => {
        const existingItemIndex = state.items.findIndex(i => i.id === item.id);

        if (existingItemIndex >= 0) {
          // Item exists, update quantity
          const newItems = [...state.items];
          newItems[existingItemIndex] = {
            ...newItems[existingItemIndex],
            quantity: newItems[existingItemIndex].quantity + 1
          };

          return {
            items: newItems,
            totalItems: state.totalItems + 1,
            totalPrice: state.totalPrice + item.price
          };
        } 
        // Add new item
        const newItem = { ...item, quantity: 1 };
        return {
          items: [...state.items, newItem],
          totalItems: state.totalItems + 1,
          totalPrice: state.totalPrice + item.price
        };

      });

      // Emit an event
      cartEvents.emit("cart:itemAdded", { 
        item: { ...item, quantity: 1 } 
      });
    };

    const removeItem = (itemId: string) => {
      // Find the item first
      const item = cart.items.find(i => i.id === itemId);
      if (!item) return;

      // Update state
      cartEvents.setState(state => {
        const newItems = state.items.filter(i => i.id !== itemId);
        return {
          items: newItems,
          totalItems: state.totalItems - item.quantity,
          totalPrice: state.totalPrice - (item.price * item.quantity)
        };
      });

      // Emit an event
      cartEvents.emit("cart:itemRemoved", { itemId });
    };

    return {
      items: cart.items,
      totalItems: cart.totalItems,
      totalPrice: cart.totalPrice,
      addItem,
      removeItem
    };
  }
*
*
*
*/
