import emulate from "@suwatte/emulator";
import { Target } from "../runners/mangakatana";
import {
  ChapterDataSchema,
  ChapterSchema,
  ContentSchema,
  PageSectionSchema,
  PagedResultSchema,
} from "@suwatte/validate";
describe("MangaKatana Tests", () => {
  const source = emulate(Target);

  describe("Paged results", () => {
    test("Popular", async () => {
      const data = await source.getDirectory({
        page: 1,
        listId: "template_popular_list",
      });
      expect(PagedResultSchema.parse(data)).toEqual(expect.any(Object));
      expect(data.results.length).toBeGreaterThan(1);
    });
    test("Query", async () => {
      const data = await source.getDirectory({
        page: 1,
        query: "doctor",
      });
      expect(PagedResultSchema.parse(data)).toEqual(expect.any(Object));
      expect(data.results.length).toBeGreaterThan(1);
    });
    test("Latest", async () => {
      const data = await source.getDirectory({
        page: 1,
        listId: "template_latest_list",
      });
      expect(PagedResultSchema.parse(data)).toEqual(expect.any(Object));
      expect(data.results.length).toBeGreaterThan(1);
    });
  });
  const id = "/manga/kanojo-okarishimasu.19331";

  test("Profile", async () => {
    const content = await source.getContent(id);
    expect(ContentSchema.parse(content)).toEqual(expect.any(Object));
  });

  test("Chapters", async () => {
    const chapters = await source.getChapters(id);
    expect(ChapterSchema.array().parse(chapters)).toEqual(expect.any(Array));
    expect(chapters.length).toBeGreaterThan(1);
  });

  test("Reader", async () => {
    const chapterId = "/manga/kanojo-okarishimasu.19331/c300";
    const data = await source.getChapterData(id, chapterId);
    expect(ChapterDataSchema.parse(data)).toEqual(expect.any(Object));
  });

  test("HomePage", async () => {
    const data = await source.getSectionsForPage({ id: "home" });
    expect(PageSectionSchema.array().parse(data)).toEqual(expect.any(Array));
  });
});
