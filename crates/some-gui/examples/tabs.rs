use iced::Application;
use iced::Settings;
use some_gui::ui::tabs::TabsApp;

pub fn main() -> iced::Result {
    TabsApp::run(Settings::default())
}
