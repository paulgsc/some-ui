use iced::theme::{Button, Container};
use iced::widget::{button, column, container, row, text};
use iced::{color, executor, Application, Background, Border, Command, Element, Length, Theme};

#[derive(Debug, Clone)]
pub enum Message {
    TabSelected(usize),
}

#[derive(Debug, Clone, PartialEq)]
pub enum TabId {
    Account,
    Password,
    Notifications,
    Billing,
}

impl TabId {
    fn title(&self) -> &'static str {
        match self {
            TabId::Account => "Account",
            TabId::Password => "Password",
            TabId::Notifications => "Notifications",
            TabId::Billing => "Billing",
        }
    }
}

pub struct TabsApp {
    active_tab: usize,
    tabs: Vec<TabId>,
}

impl Default for TabsApp {
    fn default() -> Self {
        Self {
            active_tab: 0,
            tabs: vec![TabId::Account, TabId::Password, TabId::Notifications, TabId::Billing],
        }
    }
}

impl Application for TabsApp {
    type Executor = executor::Default;
    type Message = Message;
    type Theme = Theme;
    type Flags = ();

    fn new(_flags: ()) -> (Self, Command<Message>) {
        (Self::default(), Command::none())
    }

    fn title(&self) -> String {
        String::from("Shadcn-style Tabs")
    }

    fn update(&mut self, message: Message) -> Command<Message> {
        match message {
            Message::TabSelected(index) => {
                self.active_tab = index;
                Command::none()
            }
        }
    }

    fn view(&self) -> Element<Message> {
        let tab_bar = self.create_tab_bar();
        let content = self.create_content();

        container(column![tab_bar, content].spacing(20).width(Length::Fill).height(Length::Fill))
            .padding(40)
            .width(Length::Fill)
            .height(Length::Fill)
            .into()
    }

    fn theme(&self) -> Theme {
        Theme::Light
    }
}

impl TabsApp {
    fn create_tab_bar(&self) -> Element<Message> {
        let tabs: Vec<Element<Message>> = self
            .tabs
            .iter()
            .enumerate()
            .map(|(index, tab)| {
                let is_active = index == self.active_tab;
                self.create_tab_button(tab, index, is_active)
            })
            .collect();

        container(row(tabs).spacing(0).width(Length::Shrink).height(Length::Shrink))
            .style(Container::Custom(Box::new(MyContainerStyle::Normal)))
            .padding([4, 4])
            .width(Length::Shrink)
            .height(Length::Shrink)
            .into()
    }

    fn create_tab_button(&self, tab: &TabId, index: usize, is_active: bool) -> Element<Message> {
        let button_style = if is_active {
            Button::Custom(Box::new(ActiveTabStyle))
        } else {
            Button::Custom(Box::new(InactiveTabStyle))
        };

        button(
            text(tab.title())
                .size(14)
                .horizontal_alignment(iced::alignment::Horizontal::Center)
                .vertical_alignment(iced::alignment::Vertical::Center),
        )
        .style(button_style)
        .padding([8, 12])
        .on_press(Message::TabSelected(index))
        .into()
    }

    fn create_content(&self) -> Element<Message> {
        let content_text = match self.tabs.get(self.active_tab) {
            Some(TabId::Account) => "Make changes to your account here. Click save when you're done.",
            Some(TabId::Password) => "Change your password here. After saving, you'll be logged out.",
            Some(TabId::Notifications) => "Configure your notification preferences here.",
            Some(TabId::Billing) => "Manage your billing information and subscription here.",
            None => "Content not found",
        };

        let form_content = match self.tabs.get(self.active_tab) {
            Some(TabId::Account) => column![
                text("Name").size(14),
                text("Enter your name").size(12).style(color!(0x64748b)),
                text("Username").size(14),
                text("This is your public display name.").size(12).style(color!(0x64748b)),
            ]
            .spacing(12),
            Some(TabId::Password) => column![
                text("Current password").size(14),
                text("Old password").size(12).style(color!(0x64748b)),
                text("New password").size(14),
                text("New password").size(12).style(color!(0x64748b)),
            ]
            .spacing(12),
            Some(TabId::Notifications) => column![
                text("Email notifications").size(14),
                text("Receive notifications via email").size(12).style(color!(0x64748b)),
                text("Push notifications").size(14),
                text("Receive push notifications on your device").size(12).style(color!(0x64748b)),
            ]
            .spacing(12),
            Some(TabId::Billing) => column![
                text("Plan").size(14),
                text("You are currently on the Pro plan").size(12).style(color!(0x64748b)),
                text("Payment method").size(14),
                text("Visa ending in 4242").size(12).style(color!(0x64748b)),
            ]
            .spacing(12),
            None => column![text("No content available")].spacing(12),
        };

        container(
            column![
                text(content_text).size(14).style(color!(0x64748b)),
                form_content,
                button(
                    text("Save changes")
                        .size(14)
                        .horizontal_alignment(iced::alignment::Horizontal::Center)
                        .vertical_alignment(iced::alignment::Vertical::Center)
                )
                .style(Button::Custom(Box::new(ActiveTabStyle)))
                .padding([8, 16]),
            ]
            .spacing(20)
            .width(Length::Fill),
        )
        .padding(20)
        .width(Length::Fill)
        .into()
    }
}

#[derive(Default)]
struct ActiveTabStyle;

#[derive(Default)]
struct InactiveTabStyle;

impl button::StyleSheet for ActiveTabStyle {
    type Style = iced::Theme;

    fn active(&self, _style: &Self::Style) -> button::Appearance {
        button::Appearance {
            background: Some(Background::Color(color!(0xffffff))),
            border: Border {
                color: color!(0xe2e8f0),
                width: 1.0,
                radius: 6.0.into(),
            },
            text_color: color!(0x0f172a),
            ..Default::default()
        }
    }
}

impl button::StyleSheet for InactiveTabStyle {
    type Style = iced::Theme;

    fn active(&self, _style: &Self::Style) -> button::Appearance {
        button::Appearance {
            background: Some(Background::Color(color!(0xf1f5f9))),
            border: Border {
                color: color!(0xf1f5f9),
                width: 1.0,
                radius: 6.0.into(),
            },
            text_color: color!(0x64748b),
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub enum MyContainerStyle {
    #[default]
    Normal,
    Fancy,
}

impl container::StyleSheet for MyContainerStyle {
    type Style = Theme;

    fn appearance(&self, _theme: &Theme) -> container::Appearance {
        match self {
            MyContainerStyle::Normal => container::Appearance {
                background: Some(Background::Color(color!(0xf1f5f9))),
                ..Default::default()
            },
            MyContainerStyle::Fancy => container::Appearance {
                background: Some(Background::Color(color!(0xffc0cb))), // hot pink!
                border: Border {
                    color: color!(0xff69b4),
                    width: 2.0,
                    radius: 8.0.into(),
                },
                ..Default::default()
            },
        }
    }
}
