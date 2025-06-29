import type { ClientObsState, ObsEvent } from "@overlays/types/obs-websocket"

export function updateClientObsState(
  state: ClientObsState,
  event: ObsEvent
): ClientObsState {
  switch (event.type) {
    case "streamStatusResponse":
    case "streamStateChanged":
      return {
        ...state,
        streaming: event.data.streaming ?? state.streaming,
        streamTimecode: event.data.timecode ?? state.streamTimecode,
      }
    case "recordingStatusResponse":
    case "recordStateChanged":
      return {
        ...state,
        recording: event.data.recording ?? state.recording,
        recordTimecode: event.data.timecode ?? state.recordTimecode,
      }
    case "sceneListResponse":
      return {
        ...state,
        scenes: event.data.scenes ?? state.scenes,
        currentScene: event.data.currentScene ?? state.currentScene,
      }
    case "currentSceneResponse":
    case "currentProgramSceneChanged":
      return {
        ...state,
        currentScene: event.data.sceneName ?? state.currentScene,
      }
    case "sourcesListResponse":
      return {
        ...state,
        sources: event.data.sources ?? state.sources,
      }
    case "inputListResponse":
      return {
        ...state,
        inputs: event.data.inputs ?? state.inputs,
      }
    case "audioMuteResponse":
    case "inputMuteStateChanged":
      if (
        event.data.inputName !== undefined &&
        event.data.muted !== undefined
      ) {
        return {
          ...state,
          audioMutes: {
            ...state.audioMutes,
            [event.data.inputName]: event.data.muted,
          },
        }
      }
      return state
    case "audioVolumeResponse":
    case "inputVolumeChanged":
      if (
        event.data.inputName !== undefined &&
        event.data.volumeDb !== undefined &&
        event.data.volumeMul !== undefined
      ) {
        return {
          ...state,
          audioVolumes: {
            ...state.audioVolumes,
            [event.data.inputName]: {
              volumeDb: event.data.volumeDb,
              volumeMul: event.data.volumeMul,
            },
          },
        }
      }
      return state
    case "profileListResponse":
      return {
        ...state,
        profiles: event.data.profiles ?? state.profiles,
        currentProfile: event.data.currentProfile ?? state.currentProfile,
      }
    case "currentProfileResponse":
      return {
        ...state,
        currentProfile: event.data.profileName ?? state.currentProfile,
      }
    case "sceneCollectionListResponse":
      return {
        ...state,
        collections: event.data.collections ?? state.collections,
        currentCollection:
          event.data.currentCollection ?? state.currentCollection,
      }
    case "currentCollectionResponse":
      return {
        ...state,
        currentCollection: event.data.collectionName ?? state.currentCollection,
      }
    case "virtualCamStatusResponse":
    case "virtualcamStateChanged":
      return {
        ...state,
        virtualCamActive: event.data.active ?? state.virtualCamActive,
      }
    case "replayBufferStatusResponse":
    case "replayBufferStateChanged":
      return {
        ...state,
        replayBufferActive: event.data.active ?? state.replayBufferActive,
      }
    case "studioModeResponse":
    case "studioModeStateChanged":
      return {
        ...state,
        studioModeEnabled: event.data.enabled ?? state.studioModeEnabled,
      }
    case "statsResponse":
      return {
        ...state,
        stats: event.data.stats ?? state.stats,
      }
    case "currentTransitionResponse":
    case "currentSceneTransitionChanged":
      return {
        ...state,
        currentTransitionName:
          event.data.transitionName ?? state.currentTransitionName,
        currentTransitionDuration:
          event.data.transitionDuration ?? state.currentTransitionDuration,
      }
    case "transitionListResponse":
      return {
        ...state,
        transitions: event.data.transitions ?? state.transitions,
      }
    case "sceneTransitionStarted":
      return {
        ...state,
        lastTransitionStartedName: event.data.transitionName,
      }
    case "sceneTransitionEnded":
      return {
        ...state,
        lastTransitionEndedName: event.data.transitionName,
      }
    case "filterListResponse":
      if (event.data.sourceName && event.data.filters) {
        return {
          ...state,
          sourceFilters: {
            ...state.sourceFilters,
            [event.data.sourceName]: event.data.filters,
          },
        }
      }
      return state
    case "hotkeyListResponse":
      return {
        ...state,
        hotkeys: event.data.hotkeys ?? state.hotkeys,
      }
    case "versionResponse":
    case "hello":
      return {
        ...state,
        obsVersion: event.data.obsVersion ?? state.obsVersion,
        websocketVersion: event.data.websocketVersion ?? state.websocketVersion,
      }
    case "identified":
      return {
        ...state,
        identified: true,
      }
    case "sceneItemEnableStateChanged":
      if (
        event.data.sceneName !== undefined &&
        event.data.itemId !== undefined &&
        event.data.enabled !== undefined
      ) {
        return {
          ...state,
          sceneItemEnableStates: {
            ...state.sceneItemEnableStates,
            [event.data.sceneName]: {
              ...(state.sceneItemEnableStates[event.data.sceneName] || {}),
              [event.data.itemId]: event.data.enabled,
            },
          },
        }
      }
      return state
    case "UnknownResponse":
      return {
        ...state,
        lastUnknownResponse: {
          requestType: event.data.requestType ?? "unknown",
          data: event.data.data,
        },
      }
    case "UnknownEvent":
      return {
        ...state,
        lastUnknownEvent: {
          eventType: event.data.eventType ?? "unknown",
          data: event.data.data,
        },
      }
    default:
      // If the event type is not explicitly handled, return the current state
      return state
  }
}
