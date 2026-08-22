#
# PDF text extraction for the résumé ATS check.
#
# packages/ui/resume asserts against text read back out of the compiled PDFs
# rather than against its own source, so `pdftotext` is a build input, not a
# developer convenience — without it `pnpm --filter @some-ui/resume build`
# fails at the check step.
{pkgs, ...}: {
  deps = with pkgs; [
    poppler-utils
  ];
}
