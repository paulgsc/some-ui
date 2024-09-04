// DISCLAIMER:
// This code is adapted from the Turborepo project, originally licensed under the MIT License.
// The original source can be found at: https://github.com/vercel/turborepo
// 
// The adaptations in this file are modified for specific use cases, but retain the core structure
// and principles of the original work. The MIT License governing this code allows for 
// copying, modification, and distribution, provided that the original license and copyright 
// notice are retained.



#![deny(clippy::all)]

pub mod confg;
pub mod error;
pub mod core;

use std::io;

pub use absolute_system_path::{AbsoluteSystemPath, PathRelation};
pub use absolute_system_path_buf::AbsoluteSystemPathBuf;
pub use anchored_system_path::AnchoredSystemPath;
pub use anchored_system_path_buf::AnchoredSystemPathBuf;
use camino::{Utf8Path, Utf8PathBuf};
use miette::Diagnostic;
pub use relative_unix_path::RelativeUnixPath;
pub use relative_unix_path_buf::{RelativeUnixPathBuf, RelativeUnixPathBufTestExt};
use thiserror::Error;

// Lets windows know that we're going to be reading this file sequentially
#[cfg(windows)]
pub const FILE_FLAG_SEQUENTIAL_SCAN: u32 = 0x08000000;

pub trait IntoUnix {
    fn into_unix(self) -> Utf8PathBuf;
}

#[cfg(windows)]
fn convert_separator(
    path: impl AsRef<str>,
    input_separator: char,
    output_separator: char,
) -> Utf8PathBuf {
    let path = path.as_ref();

    Utf8PathBuf::from(
        path.chars()
            .map(|c| {
                if c == input_separator {
                    output_separator
                } else {
                    c
                }
            })
            .collect::<String>(),
    )
}

impl<T: AsRef<str>> IntoUnix for T {
    /// NOTE: `into_unix` *only* converts Windows paths to Unix paths *on* a
    /// Windows system. Do not pass a Windows path on a Unix system and
    /// assume it'll be converted.
    fn into_unix(self) -> Utf8PathBuf {
        let output;

        #[cfg(windows)]
        {
            output = convert_separator(self, std::path::MAIN_SEPARATOR, '/')
        }

        #[cfg(not(windows))]
        {
            output = Utf8PathBuf::from(self.as_ref())
        }

        output
    }
}

#[derive(Debug, PartialEq)]
struct PathValidation {
    well_formed: bool,
    windows_safe: bool,
}

// Checks if path is well formed and safe for Windows.
pub(crate) fn check_path(name: &str) -> PathValidation {
    if name.is_empty() {
        return PathValidation {
            well_formed: false,
            windows_safe: false,
        };
    }

    let mut well_formed = true;
    let mut windows_safe = true;

    // Name is:
    // - "."
    // - ".."
    if well_formed && (name == "." || name == "..") {
        well_formed = false;
    }

    // Name starts with:
    // - `/`
    // - `./`
    // - `../`
    if well_formed && (name.starts_with('/') || name.starts_with("./") || name.starts_with("../")) {
        well_formed = false;
    }

    // Name ends in:
    // - `/.`
    // - `/..`
    if well_formed && (name.ends_with("/.") || name.ends_with("/..")) {
        well_formed = false;
    }

    // Name contains:
    // - `//`
    // - `/./`
    // - `/../`
    if well_formed && (name.contains("//") || name.contains("/./") || name.contains("/../")) {
        well_formed = false;
    }

    // Name contains: `\`
    if name.contains('\\') {
        windows_safe = false;
    }

    PathValidation {
        well_formed,
        windows_safe,
    }
}

pub enum UnknownPathType {
    Absolute(AbsoluteSystemPathBuf),
    Anchored(AnchoredSystemPathBuf),
}

/// Categorizes a path as either an `AbsoluteSystemPathBuf` or
/// an `AnchoredSystemPathBuf` depending on whether it
/// is absolute or relative.
pub fn categorize(path: &Utf8Path) -> UnknownPathType {
    let path = Utf8PathBuf::try_from(path_clean::clean(path))
        .expect("path cleaning should preserve UTF-8");
    if path.is_absolute() {
        UnknownPathType::Absolute(AbsoluteSystemPathBuf(path))
    } else {
        UnknownPathType::Anchored(AnchoredSystemPathBuf(path))
    }
}

#[cfg(test)]
mod tests {
    use test_case::test_case;

    use crate::{check_path, IntoUnix, PathValidation};

    #[test]
    fn test_into_unix() {
        #[cfg(unix)]
        {
            assert_eq!("foo/bar".into_unix(), "foo/bar");
            assert_eq!("/foo/bar".into_unix(), "/foo/bar");
            assert_eq!("foo\\bar".into_unix(), "foo\\bar");
        }

        #[cfg(windows)]
        {
            assert_eq!("foo/bar".into_unix(), "foo/bar");
            assert_eq!("\\foo\\bar".into_unix(), "/foo/bar");
            assert_eq!("foo\\bar".into_unix(), "foo/bar");
        }
    }

    #[test_case("", PathValidation { well_formed: false, windows_safe: false } ; "1")]
    #[test_case(".", PathValidation { well_formed: false, windows_safe: true } ; "2")]
    #[test_case("..", PathValidation { well_formed: false, windows_safe: true } ; "3")]
    #[test_case("/", PathValidation { well_formed: false, windows_safe: true } ; "4")]
    #[test_case("./", PathValidation { well_formed: false, windows_safe: true } ; "5")]
    #[test_case("../", PathValidation { well_formed: false, windows_safe: true } ; "6")]
    #[test_case("/a", PathValidation { well_formed: false, windows_safe: true } ; "7")]
    #[test_case("./a", PathValidation { well_formed: false, windows_safe: true } ; "8")]
    #[test_case("../a", PathValidation { well_formed: false, windows_safe: true } ; "9")]
    #[test_case("/.", PathValidation { well_formed: false, windows_safe: true } ; "10")]
    #[test_case("/..", PathValidation { well_formed: false, windows_safe: true } ; "11")]
    #[test_case("a/.", PathValidation { well_formed: false, windows_safe: true } ; "12")]
    #[test_case("a/..", PathValidation { well_formed: false, windows_safe: true } ; "13")]
    #[test_case("//", PathValidation { well_formed: false, windows_safe: true } ; "14")]
    #[test_case("/./", PathValidation { well_formed: false, windows_safe: true } ; "15")]
    #[test_case("/../", PathValidation { well_formed: false, windows_safe: true } ; "16")]
    #[test_case("a//", PathValidation { well_formed: false, windows_safe: true } ; "17")]
    #[test_case("a/./", PathValidation { well_formed: false, windows_safe: true } ; "18")]
    #[test_case("a/../", PathValidation { well_formed: false, windows_safe: true } ; "19")]
    #[test_case("//a", PathValidation { well_formed: false, windows_safe: true } ; "20")]
    #[test_case("/./a", PathValidation { well_formed: false, windows_safe: true } ; "21")]
    #[test_case("/../a", PathValidation { well_formed: false, windows_safe: true } ; "22")]
    #[test_case("a//a", PathValidation { well_formed: false, windows_safe: true } ; "23")]
    #[test_case("a/./a", PathValidation { well_formed: false, windows_safe: true } ; "24")]
    #[test_case("a/../a", PathValidation { well_formed: false, windows_safe: true } ; "25")]
    #[test_case("...", PathValidation { well_formed: true, windows_safe: true } ; "26")]
    #[test_case(".../a", PathValidation { well_formed: true, windows_safe: true } ; "27")]
    #[test_case("a/...", PathValidation { well_formed: true, windows_safe: true } ; "28")]
    #[test_case("a/.../a", PathValidation { well_formed: true, windows_safe: true } ; "29")]
    #[test_case(".../...", PathValidation { well_formed: true, windows_safe: true } ; "30")]
    fn test_check_path(path: &'static str, expected_output: PathValidation) {
        let output = check_path(path);
        assert_eq!(output, expected_output);
    }
}

