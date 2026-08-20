import { code } from "@streamdown/code"
import { Streamdown } from "streamdown"

const markdownClassName =
  "max-w-none text-sm leading-6 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-black/8 [&_code]:px-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/8 [&_pre]:p-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_ul]:list-disc"

export function ThreadMarkdown({
  text,
  streaming = false,
}: {
  readonly text: string
  readonly streaming?: boolean
}) {
  return (
    <Streamdown
      className={markdownClassName}
      isAnimating={streaming}
      mode={streaming ? "streaming" : "static"}
      plugins={{ code }}
      skipHtml
    >
      {text}
    </Streamdown>
  )
}
