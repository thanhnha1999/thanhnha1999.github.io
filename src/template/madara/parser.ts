/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  Chapter,
  ChapterData,
  ChapterPage,
  Content,
  Highlight,
  PagedResult,
  Property,
  ReadingMode,
  Tag,
} from "@suwatte/daisuke";
import { load } from "cheerio";
import { trim } from "lodash";
import { TAG_PREFIX } from "./constants";
import { Context } from "./types";
import {
  generateAnchorTag,
  imageFromElement,
  notUpdating,
  parseDate,
  parseStatus,
} from "./utils";

export class Parser {
  AJAXResponse(ctx: Context, html: string): Highlight[] {
    const highlights: Highlight[] = [];
    const $ = load(html);

    for (const element of $(".page-item-detail")) {
      const title = $("a", $("h3.h5", element)).text();
      const id = $("a", $("h3.h5", element))
        .attr("href")
        ?.replace(`${ctx.baseUrl}/${ctx.contentPath}/`, "")
        .replace(/\/$/, "");

      if (!title || !id) {
        continue;
      }

      const imageElement = $("img", element);
      const imageURL = imageFromElement(imageElement);

      highlights.push({
        id,
        title,
        cover: imageURL,
      });
    }
    return highlights;
  }

  content(ctx: Context, html: string, contentId: string): Content {
    const $ = load(html);

    // Title
    /**
     * Removes the Text from child elements so we get only the text from the H1 Tag
     * Reference: https://stackoverflow.com/a/8851526
     */
    const title = $(ctx.titleSelector)
      .first()
      ?.clone()
      .children()
      .remove()
      .end()
      .text()
      .trim();
    if (!title)
      throw new Error("Title not found\nPotentially incorrect selectors");

    // Author
    const authors = $(ctx.authorSelector)
      .toArray()
      .map((node) => generateAnchorTag($, node))
      .filter(notUpdating)
      .map(
        (tag): Tag => ({
          id: `${TAG_PREFIX.author}|tag.title.toLowerCase()`,
          title: tag.title,
          nsfw: false,
        })
      );
    // Artists
    const artists = $(ctx.artistSelector)
      .toArray()
      .map((node) => generateAnchorTag($, node))
      .filter(notUpdating)
      .map(
        (tag): Tag => ({
          id: `${TAG_PREFIX.artist}|tag.title.toLowerCase()`,
          title: tag.title,
          nsfw: false,
        })
      );

    // Creators
    const creators = Array.from(
      new Set(authors.concat(artists).map((v) => v.title))
    );

    // Summary
    let summary = "";
    const summaryNode = $(ctx.summarySelector);
    if ($(summaryNode, "p").text().trim()) {
      summary = $(summaryNode, "p")
        .toArray()
        .map((v): string => {
          const elem = $(v);
          return elem.text().replace("<br>", "\n");
        })
        .join("\n\n")
        .trim();
    } else {
      summary = $(ctx.summarySelector).text().trim();
    }

    // Cover
    const coverElem = $(ctx.thumbnailSelector).first();
    const cover = imageFromElement(coverElem);

    // Status
    const statusString = $(ctx.statusSelector).last()?.text().trim() ?? "";
    const status = parseStatus(statusString);

    // Genres
    const genres = $(ctx.genreSelector)
      .toArray()
      .map((node) => generateAnchorTag($, node))
      .map(
        (v): Tag => ({
          id:
            v
              .link!.split("/")
              .filter((v) => v)
              .pop() ?? "",
          title: v.title,
          nsfw: ctx.adultTags.includes(v.title.toLowerCase()),
        })
      )
      .filter((v) => v.id);

    const hashtags = $(ctx.tagSelector)
      .toArray()
      .map((node) => generateAnchorTag($, node))
      .map(
        (v): Tag => ({
          id: `${TAG_PREFIX.hashtag}${
            v
              .link!.split("/")
              .filter((v) => v)
              .pop() ?? ""
          }`,
          title: v.title,
          nsfw: ctx.adultTags.includes(v.title.toLowerCase()),
        })
      )
      .filter((v) => v.id.replace(TAG_PREFIX.hashtag, ""));

    const additionalTitles = $(ctx.alternativeTitlesSelector)
      .first()
      .text()
      .trim()
      .split(";")
      .map(trim);

    const isNSFW = genres.some((v) => v.nsfw);

    const properties: Property[] = [
      {
        id: "main",
        title: "Genres",
        tags: genres,
      },
      {
        id: "supporting",
        title: "Tags",
        tags: hashtags,
      },
      {
        id: "creators",
        title: "Credits",
        tags: [
          ...authors.map((v): Tag => ({ ...v, title: `Story By ${v.title}` })),
          ...artists.map((v): Tag => ({ ...v, title: `Art By ${v.title}` })),
        ],
      },
    ];

    const chapters = this.chapters(ctx, html, contentId);
    return {
      title,
      cover,
      summary: summary ? summary : undefined,
      creators,
      status,
      isNSFW,
      properties,
      ...(chapters.length > 0 && { chapters }),
      recommendedPanelMode: ctx.defaultReadingMode
        ? ctx.defaultReadingMode
        : ReadingMode.WEBTOON,
      additionalTitles:
        additionalTitles.length != 0 ? additionalTitles : undefined,
    };
  }

  chapters(ctx: Context, html: string, contentId: string): Chapter[] {
    const $ = load(html);
    const chapters: Chapter[] = [];
    const nodes = $(ctx.chapterSelector).toArray();
    for (const [index, node] of nodes.entries()) {
      const elem = $(node);

      const id = $("a", elem)
        .first()
        .attr("href")
        ?.replace(`${ctx.baseUrl}/${ctx.contentPath}/${contentId}/`, "")
        .replace(/\/$/, "");

      if (!id) throw new Error("Failed to parse Chapter ID");
      const title = $("a", elem).first().text().trim();

      const numStr = id
        .match(/\D*(\d*-?\d*)\D*$/)
        ?.pop()
        ?.replace(/-/g, ".");
      const number = Number(numStr);
      const dateStr = $(ctx.chapterDateSelector, elem).first().text().trim();

      chapters.push({
        index,
        chapterId: id,
        number,
        date: ctx.dateFormat ? parseDate(dateStr) : new Date(),
        title,
        language: "en_us",
      });
    }

    return chapters;
  }

  chapterData(ctx: Context, html: string): ChapterData {
    const $ = load(html);
    const nodes = $(ctx.imageSelector).toArray();

    const pages: ChapterPage[] = nodes
      .map((node) => imageFromElement($(node)).trim())
      .map((url): ChapterPage => ({ url }));

    return {
      pages,
    };
  }

  // Parse Genres
  genres(ctx: Context, html: string) {
    const $ = load(html);

    const nodes = $("div.checkbox", "div.checkbox-group").toArray();

    const tags = nodes
      .map((node): Tag => {
        const title = $("label", node).text().trim();
        const id = $("input[type=checkbox]", node).attr("value")?.trim() ?? "";
        const nsfw = ctx.adultTags.includes(title.toLowerCase());
        return { title, id, nsfw };
      })
      .filter((v) => v.id);

    return tags;
  }

  searchResponse(ctx: Context, html: string): PagedResult {
    const $ = load(html);
    const nodes = $(ctx.searchSelector).toArray();
    const highlights: Highlight[] = nodes.map((node) => {
      const title =
        $("a", node).attr("title") ?? $(".post-title", node).text().trim();
      const id = $("a", node)
        .attr("href")
        ?.replace(`${ctx.baseUrl}/${ctx.contentPath}/`, "")
        .replace(/\/$/, "");

      if (!title || !id) throw "Failed to Parse Search Result";

      const cover = imageFromElement($("img", node));

      return {
        title,
        id,
        cover,
      };
    });

    const isLast =
      $("div.nav-previous, nav.navigation-ajax, a.nextpostslink").toArray()
        .length === 0;
    return {
      results: highlights,
      isLastPage: isLast,
    };
  }
}
