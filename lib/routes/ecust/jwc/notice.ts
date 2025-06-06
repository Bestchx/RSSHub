import { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';

const baseUrl = 'https://jwc.ecust.edu.cn';
const categoryMap = {
    mto: { link: '/3938', name: '教学运行管理' },
    mttb: { link: '/3939', name: '培养与教学建设管理' },
    gi: { link: '/zhglbgs', name: '综合信息' },
    mpt: { link: '/3940', name: '实践教学管理' },
    fai: { link: '/3941', name: '学院教务信息' },
};
const get_from_link = async (link) => {
    const { data: response } = await got(link);
    const $ = load(response);
    const articleList = $('div#wp_news_w2 table[width="100%"]')
        .toArray()
        .map((item) => {
            const a = $(item).find('a');
            const date = $(item).find('div[style="white-space:nowrap"]').first();
            // deal with article_link
            let articleLink = a.attr('href');
            if (!articleLink.startsWith('http')) {
                articleLink = `${baseUrl}${articleLink}`;
            }
            articleLink = articleLink.replace(/^https:\/\/(\w+)-ecust-edu-cn-s\.sslvpn\.ecust\.edu\.cn:8118/, 'https://$1.ecust.edu.cn').replace(/^https:\/\/ecust-edu-cn-s\.sslvpn\.ecust\.edu\.cn:8118/, 'https://ecust.edu.cn');
            return {
                title: a.text(),
                link: articleLink,
                pubDate: parseDate(date.text()),
            };
        });
    return articleList;
};
export const route: Route = {
    path: '/jwc/:category?',
    categories: ['university'],
    example: '/ecust/jwc/mto',
    parameters: { category: '订阅板块，默认为全部订阅' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '本科教务处信息网',
    maintainers: ['lxl66566'],
    handler,
    description: `| 其他任意值 | mto          | mttb               | gi       | mpt          | fai          |
| ---------- | ------------ | ------------------ | -------- | ------------ | ------------ |
| 全部订阅   | 教学运行管理 | 培养与教学建设管理 | 综合信息 | 实践教学管理 | 学院教务信息 |`,
};

async function handler(ctx) {
    const { category = 'all' } = ctx.req.param();
    const categoryItem = categoryMap[category] || null; // all -> null
    const pageUrl = categoryItem ? [`${baseUrl}${categoryItem.link}/list.htm`] : Object.values(categoryMap).map((item) => `${baseUrl}${item.link}/list.htm`);
    const items = (await Promise.all(pageUrl.map((link) => get_from_link(link)))).flat();
    const result = await Promise.all(
        items.map((item) =>
            cache.tryGet(item.link, async () => {
                const { data: response } = await got(item.link);
                const content = load(response);
                // remove all attrs and empty objects
                content('div.wp_articlecontent *').each(function () {
                    if (!content(this).text().trim()) {
                        return content(this).remove();
                    }
                    for (const attr in this.attribs) {
                        content(this).removeAttr(attr);
                    }
                });
                const description = content('div.wp_articlecontent').first().html();
                // merge same objects, replace two times instead of replace recursively
                description && (item.description = description.replaceAll(/<\/(p|span|strong)>\s*<\1>/g, '').replaceAll(/<\/(p|span|strong)>\s*<\1>/g, ''));
                return item;
            })
        )
    );
    return {
        title: `华理教务处 - ${categoryItem ? categoryItem.name : '全部'}`,
        link: categoryItem ? pageUrl[0] : baseUrl,
        item: result,
    };
}
