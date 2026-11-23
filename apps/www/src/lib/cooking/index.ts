/**
 * The Cooking page's data (LEDGER-WEB, #3425): the run's trains, read as
 * the page opens and when the owner asks again (`./read`), kept for a
 * minute, never on a timer, since GitHub answers a reader without an
 * account 60 times an hour. Where each train stands is `./model`'s, the
 * colours and the bar's pick `./algebra`'s, the list and the card
 * `./board`'s, every word `./words`'.
 */
import { queryOptions } from "@tanstack/react-query"

import { readCooking } from "./read"

export const cookingQuery = queryOptions({
  queryKey: ["cooking"],
  queryFn: readCooking,
  staleTime: 60_000,
  retry: false,
  refetchOnWindowFocus: false,
})
