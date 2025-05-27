use leptos::html::Input;
use leptos::*;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// Define our form states
#[derive(Clone, Debug, PartialEq)]
enum InputState {
    Empty,
    Typing,
    Submitting,
    Error(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    content: String,
    is_user: bool,
}

#[component]
fn ChatInput(on_submit: Callback<String>, #[prop(default = false)] disabled: bool, #[prop(default = "Send a message")] placeholder: &'static str) -> impl IntoView {
    let (input_value, set_input_value) = create_signal(String::new());
    let (input_state, set_input_state) = create_signal(InputState::Empty);
    let input_ref = create_node_ref::<Input>();

    let handle_input = move |ev| {
        let value = event_target_value(&ev);
        set_input_value.set(value.clone());

        if value.trim().is_empty() {
            set_input_state.set(InputState::Empty);
        } else {
            set_input_state.set(InputState::Typing);
        }
    };

    let handle_submit = move |ev: ev::SubmitEvent| {
        ev.prevent_default();

        let current_value = input_value.get();
        if current_value.trim().is_empty() {
            return;
        }

        set_input_state.set(InputState::Submitting);

        // Call the provided on_submit callback
        on_submit.call(current_value);

        // Clear the input and reset state
        set_input_value.set(String::new());
        set_input_state.set(InputState::Empty);

        // Focus back on the input
        if let Some(input) = input_ref.get() {
            let _ = input.focus();
        }
    };

    let handle_keydown = move |ev: ev::KeyboardEvent| {
        if ev.key() == "Enter" && !ev.shift_key() {
            ev.prevent_default();
            let form_elem = ev
                .target()
                .and_then(|t| t.dyn_into::<web_sys::HtmlElement>().ok())
                .and_then(|el| el.closest("form").ok())
                .flatten();

            if let Some(form) = form_elem {
                let form = form.dyn_into::<web_sys::HtmlFormElement>().unwrap();
                form.request_submit().unwrap_or_default();
            }
        }
    };

    let button_class = move || match input_state.get() {
        InputState::Empty => "chat-button chat-button-disabled",
        InputState::Typing => "chat-button chat-button-enabled",
        InputState::Submitting => "chat-button chat-button-submitting",
        InputState::Error(_) => "chat-button chat-button-error",
    };

    let button_disabled = move || matches!(input_state.get(), InputState::Empty | InputState::Submitting) || disabled;

    view! {
                <form
                            class="chat-input-container"
                            on:submit=handle_submit
                            >
                            <div class="chat-input-wrapper">
                            <textarea
                            node_ref=input_ref
                            class="chat-input"
                            placeholder=placeholder
                            value=input_value
                            on:input=handle_input
                            on:keydown=handle_keydown
                            disabled=move || disabled || matches!(input_state.get(), InputState::Submitting)
                            rows="1"
                            autofocus=true
                            />

                            <button
                            type="submit"
                            class=button_class
                            disabled=button_disabled
                            >
                            {move || match input_state.get() {
                                                                         InputState::Submitting => view! { <LoadingSpinner /> },
                                                                         _ => view! { <SendIcon /> }
                                                             }}
                </button>
                            </div>

                            {move || {
                                                 if let InputState::Error(error) = &input_state.get() {
                                                             view! {
                                                                         <div class="chat-input-error">
                                                                         {error}
                                                                         </div>
                                                             }
                                                 } else {
                                                             view! { <div></div> }
                                                 }
                                     }}
                </form>
    }
}

#[component]
fn LoadingSpinner() -> impl IntoView {
    view! {
                <div class="spinner-container">
                            <div class="spinner"></div>
                            </div>
    }
}

#[component]
fn SendIcon() -> impl IntoView {
    view! {
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
    }
}

// WASM exports for React integration
#[wasm_bindgen]
pub struct ChatInputForm {
    render_func: Box<dyn Fn() -> View>,
    container: Option<web_sys::Element>,
}

#[wasm_bindgen]
impl ChatInputForm {
    #[wasm_bindgen(constructor)]
    pub fn new(container_id: &str, placeholder: &str, disabled: bool, callback: &js_sys::Function) -> Self {
        let container = web_sys::window().unwrap().document().unwrap().get_element_by_id(container_id);

        let callback_fn = {
            let callback = callback.clone();
            move |value: String| {
                let this = JsValue::NULL;
                let value = JsValue::from_str(&value);
                let _ = callback.call1(&this, &value);
            }
        };

        let render_func = Box::new(move || {
            view! {
                        <ChatInput
                                    on_submit=Callback::new(callback_fn.clone())
                                    disabled=disabled
                                    placeholder=placeholder
                                    />
            }
        });

        Self { render_func, container }
    }

    pub fn render(&self) -> Result<(), JsValue> {
        if let Some(container) = &self.container {
            let view = (self.render_func)();
            leptos::mount_to(container.clone(), view);
            Ok(())
        } else {
            Err(JsValue::from_str("Container element not found"))
        }
    }

    pub fn cleanup(&self) -> Result<(), JsValue> {
        if let Some(container) = &self.container {
            // Clean up Leptos component
            container.set_inner_html("");
            Ok(())
        } else {
            Err(JsValue::from_str("Container element not found"))
        }
    }
}

// For CSS styling
#[wasm_bindgen]
pub fn inject_chat_styles() -> Result<(), JsValue> {
    let window = web_sys::window().expect("no global 'window' exists");
    let document = window.document().expect("should have a document on window");

    let style = document.create_element("style")?;
    style.set_text_content(Some(r#"
                                .chat-input-container {
                                            width: 100%;
                                                        max-width: 800px;
                                                                    margin: 0 auto;
                                                                            }

                                                                                            .chat-input-wrapper {
                                                                                                        display: flex;
                                                                                                                    border: 1px solid #e0e0e0;
                                                                                                                                border-radius: 8px;
                                                                                                                                            overflow: hidden;
                                                                                                                                                        background-color: #fff;
                                                                                                                                                                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
                                                                                                                                                                                position: relative;
                                                                                                                                                                                        }

                                                                                                                                                                                                        .chat-input {
                                                                                                                                                                                                                    flex: 1;
                                                                                                                                                                                                                                padding: 12px 16px;
                                                                                                                                                                                                                                            border: none;
                                                                                                                                                                                                                                                        outline: none;
                                                                                                                                                                                                                                                                    resize: none;
                                                                                                                                                                                                                                                                                font-size: 16px;
                                                                                                                                                                                                                                                                                            line-height: 1.5;
                                                                                                                                                                                                                                                                                                        min-height: 24px;
                                                                                                                                                                                                                                                                                                                }

                                                                                                                                                                                                                                                                                                                                .chat-input:disabled {
                                                                                                                                                                                                                                                                                                                                            background-color: #f5f5f5;
                                                                                                                                                                                                                                                                                                                                                        cursor: not-allowed;
                                                                                                                                                                                                                                                                                                                                                                }

                                                                                                                                                                                                                                                                                                                                                                                .chat-button {
                                                                                                                                                                                                                                                                                                                                                                                            display: flex;
                                                                                                                                                                                                                                                                                                                                                                                                        align-items: center;
                                                                                                                                                                                                                                                                                                                                                                                                                    justify-content: center;
                                                                                                                                                                                                                                                                                                                                                                                                                                width: 48px;
                                                                                                                                                                                                                                                                                                                                                                                                                                            border: none;
                                                                                                                                                                                                                                                                                                                                                                                                                                                        cursor: pointer;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    background: none;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                transition: background-color 0.2s;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        }

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        .chat-button-disabled {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    color: #ccc;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                cursor: not-allowed;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        }

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        .chat-button-enabled {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    color: #1a73e8;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            }

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            .chat-button-enabled:hover {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        background-color: #f0f7ff;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                }

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                .chat-button-submitting {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            color: #1a73e8;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        cursor: not-allowed;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                }

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                .chat-button-error {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            color: #d32f2f;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    }

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    .chat-input-error {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                color: #d32f2f;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            font-size: 14px;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        margin-top: 8px;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                }

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                .spinner-container {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            display: flex;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        align-items: center;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    justify-content: center;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                width: 24px;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            height: 24px;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    }

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    .spinner {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                width: 18px;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            height: 18px;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        border: 2px solid transparent;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    border-top-color: currentColor;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                border-radius: 50%;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            animation: spin 0.8s linear infinite;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    }

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    @keyframes spin {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    to { transform: rotate(360deg); }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        "#));

    let head = document.head().expect("document should have a head");
    head.append_child(&style)?;

    Ok(())
}

// Entry point for wasm-bindgen
#[wasm_bindgen(start)]
pub fn wasm_start() {
    // Initialize logging for debugging in browser
    console_error_panic_hook::set_once();
}
