/**
 * `linkReach` tells a link the run opens itself from one it can't, by its
 * host alone: exactly one of `RUN_HOSTS`, over https.
 */
import { linkReach, RUN_HOSTS } from "@job-desk/policy"
import { describe, expect, it } from "vitest"

describe("linkReach", () => {
  it("opens every host in RUN_HOSTS", () => {
    for (const host of Object.values(RUN_HOSTS).flat()) {
      expect(linkReach(`https://${host}/acme/1`)).toBe("opens")
    }
  })

  it("reads the host whatever its case, the path, the query or spaces around it", () => {
    expect(linkReach("  https://JOBS.Lever.co/Acme/1?lever-source=x  ")).toBe(
      "opens"
    )
  })

  it("can't open any other host", () => {
    for (const url of [
      "https://jobs.gusto.com/postings/tarpon-health-1",
      "https://www.indeed.com/viewjob?jk=1",
      "https://www.linkedin.com/jobs/view/1",
      "https://acme.wd5.myworkdayjobs.com/careers/job/1",
    ]) {
      expect(linkReach(url)).toBe("cannot-open")
    }
  })

  it("can't open a subdomain of a listed host, or a name that only ends in one", () => {
    for (const url of [
      "https://job-boards.eu.greenhouse.io/acme/jobs/1",
      "https://www.jobs.lever.co/acme/1",
      "https://greenhouse.io/acme/jobs/1",
      "https://lever.co/acme/1",
      "https://jobs.lever.co.example.com/acme/1",
      "https://notjobs.ashbyhq.com/acme/1",
    ]) {
      expect(linkReach(url)).toBe("cannot-open")
    }
  })

  it("has no answer for what isn't an https link", () => {
    for (const url of [
      "",
      "   ",
      "jobs.lever.co/acme/1",
      "not a link",
      "http://jobs.lever.co/acme/1",
      "ftp://jobs.lever.co/acme/1",
      "mailto:jobs@lever.co",
    ]) {
      expect(linkReach(url)).toBeNull()
    }
  })
})
