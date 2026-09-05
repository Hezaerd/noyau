import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ThreadMarkdown } from "../src/components/thread/ThreadMarkdown"

describe("ThreadMarkdown", () => {
  it.each([false, true])(
    "keeps GFM footnote references linked to their definitions (%s)",
    (streaming) => {
      const html = renderToStaticMarkup(
        <ThreadMarkdown streaming={streaming} text={"Claim[^1].\n\n[^1]: Supporting detail."} />,
      )

      expect(html).toContain('href="#user-content-fn-1"')
      expect(html).toContain('id="user-content-fn-1"')
      expect(html).not.toContain("user-content-user-content-")
      expect(html).toContain('href="#user-content-fnref-1"')
    },
  )
})
