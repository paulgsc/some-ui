import type { Message } from "@chat/types/chat"

import { pgdevPng } from "../../../../../assets"

export const mockMessages: Array<Message> = [
  {
    id: "1",
    character: "ai",
    position: "right",
    content: "👋 안녕하세요! 무엇을 도와드릴까요?",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:15:32 GMT-0700",
    avatar: { src: pgdevPng, alt: "ai" },
  },
  {
    id: "2",
    character: "pgdev",
    position: "left",
    content: "그냥 구경하고 있어요!",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:15:35 GMT-0700",
    avatar: { src: pgdevPng, alt: "pgdev" },
  },
  {
    id: "3",
    character: "ai",
    position: "right",
    content:
      "네, 알겠습니다.\n\n도움이 필요하시면 언제든지 아래에 질문을 남겨주세요 👇",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:15:38 GMT-0700",
    avatar: { src: pgdevPng, alt: "ai" },
  },
  {
    id: "4",
    character: "pgdev",
    position: "left",
    content:
      "사실, '스트림 아카이브' 섹션에 대해 궁금한 게 있어요. 좀... 독특하네요.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:15:41 GMT-0700",
    avatar: { src: pgdevPng, alt: "pgdev" },
  },
  {
    id: "5",
    character: "ai",
    position: "right",
    content:
      "아, 그거요. 지극히 개인적인 것들이죠. 공공장소에 남겨둔 '디지털 메모'라고 생각하시면 됩니다.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:15:47 GMT-0700",
    avatar: { src: pgdevPng, alt: "ai" },
  },
  {
    id: "6",
    character: "pgdev",
    position: "left",
    content: "그럼 시청자들을 위해 만든 게 아니라는 뜻인가요?",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:15:50 GMT-0700",
    avatar: { src: pgdevPng, alt: "pgdev" },
  },
  {
    id: "7",
    character: "ai",
    position: "right",
    content:
      "정확합니다. 누군가 우연히 발견해서 유용한 정보를 얻는다면 다행이지만, 구조나 소통을 보장하지는 않거든요. 저 자신을 위한 흔적을 남기는 것에 가깝죠.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:15:53 GMT-0700",
    avatar: { src: pgdevPng, alt: "ai" },
  },
  {
    id: "8",
    character: "pgdev",
    position: "left",
    content:
      "이해했어요. 일종의... 실수로 공개된 '디지털 은둔자의 일기' 같은 거군요. 고독한 원칙이 느껴져요.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:15:56 GMT-0700",
    avatar: { src: pgdevPng, alt: "pgdev" },
  },
  {
    id: "9",
    character: "ai",
    position: "right",
    content:
      "그렇게 볼 수도 있겠네요. 코드를 공개하는 건 제 방식이지만, 과정 자체는 그저 혼잣말일 뿐입니다. 어떤 기대나 보장도 없는 기록물이죠.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:15:59 GMT-0700",
    avatar: { src: pgdevPng, alt: "ai" },
  },
  {
    id: "10",
    character: "pgdev",
    position: "left",
    content:
      "그렇다면 누가 영상을 본다는 건, 주인 없는 작업실에 몰래 들어가는 것과 비슷하겠네요?",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:16:02 GMT-0700",
    avatar: { src: pgdevPng, alt: "pgdev" },
  },
  {
    id: "11",
    character: "ai",
    position: "right",
    content:
      "맞아요. 관찰하는 건 자유지만, 장인(artisan)은 그들의 존재를 의식하지 않습니다. 시청자를 위한 '공연'은 없다는 점을 이해해야 하죠.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:16:05 GMT-0700",
    avatar: { src: pgdevPng, alt: "ai" },
  },
  {
    id: "12",
    character: "pgdev",
    position: "left",
    content:
      "참 솔직하시네요. 보통은 구독자를 늘리거나 공동체를 만들려고 노력하잖아요.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:16:08 GMT-0700",
    avatar: { src: pgdevPng, alt: "pgdev" },
  },
  {
    id: "13",
    character: "ai",
    position: "right",
    content:
      "공동체는 목표를 공유해야 하지만 제 목적은 고독한 작업입니다. 공유되는 건 결과물인 코드이지, 제작 과정이 아닙니다. 유용하든 아니든 상관없어요. 잃을 게 없으니까요.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:16:11 GMT-0700",
    avatar: { src: pgdevPng, alt: "ai" },
  },
  {
    id: "14",
    character: "pgdev",
    position: "left",
    content: "그럼 만약 누군가 구독을 하거나 댓글을 남긴다면요?",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:16:17 GMT-0700",
    avatar: { src: pgdevPng, alt: "pgdev" },
  },
  {
    id: "15",
    character: "ai",
    position: "right",
    content:
      "자유지만 답변이나 인정을 보장하진 않습니다. 바다에 띄워 보낸 유리병 속의 편지 같은 거죠. 누군가에게 닿을 수도 있고 아닐 수도 있지만, 유리병이 신경 쓸 일은 아닙니다.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:16:20 GMT-0700",
    avatar: { src: pgdevPng, alt: "ai" },
  },
  {
    id: "16",
    character: "pgdev",
    position: "left",
    content: "좀... 무심해 보이시네요.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:16:23 GMT-0700",
    avatar: { src: pgdevPng, alt: "pgdev" },
  },
  {
    id: "17",
    character: "ai",
    position: "right",
    content:
      "상호작용에 대한 기대가 없을 뿐입니다. 하지만 코드에 대해서는 진심이죠. 핵심은 코드이고, 나머지는 부차적인 것들이니까요.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:16:26 GMT-0700",
    avatar: { src: pgdevPng, alt: "ai" },
  },
  {
    id: "18",
    character: "pgdev",
    position: "left",
    content: "오픈 소스 원칙도 자신을 위한 건가요?",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:16:29 GMT-0700",
    avatar: { src: pgdevPng, alt: "pgdev" },
  },
  {
    id: "19",
    character: "ai",
    position: "right",
    content:
      "그건 신념의 문제입니다. 정보는 자유롭게 흘러야 하고 지식은 공유되어야 하죠. 저의 문제가 아니라 코드와 그 잠재력에 관한 일입니다.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:17:29 GMT-0700",
    avatar: { src: pgdevPng, alt: "ai" },
  },
  {
    id: "20",
    character: "pgdev",
    position: "left",
    content:
      "당신은 모순적인 분이군요. 방송을 하는 은둔자이자, 모든 걸 공유하는 고독한 사람이라니.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:17:49 GMT-0700",
    avatar: { src: pgdevPng, alt: "pgdev" },
  },
  {
    id: "21",
    character: "ai",
    position: "right",
    content:
      "그럴지도요. 아니면 그저 기대라는 짐 없이, 창작과 공유의 자유를 즐기는 한 사람일 뿐일지도 모릅니다.",
    type: "chat",
    timestamp: "Thu Apr 03 2025 18:18:19 GMT-0700",
    avatar: { src: pgdevPng, alt: "ai" },
  },
]
