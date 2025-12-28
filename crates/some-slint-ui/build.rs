// build.rs - Build script for compiling Slint files
fn main() {
    slint_build::compile("ui/main.slint").unwrap();
}
