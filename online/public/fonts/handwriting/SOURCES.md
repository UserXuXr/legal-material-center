# 字体来源与授权（v3）

下载日期：2026-11-21（Asia/Shanghai）。仅随本样例分析包分发，不单独出售字体文件。
v1 书法体与 v2 的四款日常硬笔仍保留在各自目录，本版在四款基础上增加第 5 款，来源不同，不是换名。

包内 `fonts/subset/` 为按示例字形裁剪的子集。完整源文件在 `fonts/full/`（含约 30MB 的秋茄全字库），不打进交付 ZIP。

## 五款日常硬笔手写（均为 SIL Open Font License 1.1）

已从官方页面核验许可证，并用 fontTools 确认「沈予安」「今天天气很好。你好，我叫沈予安。」均有字形（辰宇落雁源以繁体为主，本包只用已覆盖字形；句子不用 ASCII 空格，以免个别字库缺 U+0020）。

| 字体 | 风格 | 官方来源 | 完整文件 SHA256 |
| --- | --- | --- | --- |
| 小赖字体 Xiaolai v3.126 | 圆润硬笔，濑户字体简体补全 | https://github.com/lxgw/kose-font Releases v3.126 `Xiaolai-Regular.ttf`；OFL：仓库 OFL.txt | e2f68daf0e72777a8cf58bc83de1b98634b251e537ddbfca24b0ae50d1802da2 |
| 清松手写体8p 随性 | 游清松用原子笔手写，随性日常 | https://github.com/jasonhandwriting/JasonHandwriting `JasonHandwriting8p.ttf`；说明见仓库 README 与 https://jasonfonts.max-everyday.com/about/ | 368e64b89d468f72986a576674f8a4344c464d4d3f4596c93fe6692c70c18743 |
| 辰宇落雁体 2.0 细 | 细硬笔日常手写 | https://github.com/Chenyu-otf/chenyuluoyan_thin Releases v2.0 `ChenYuluoyan-2.0-Thin.ttf`；license.txt | 1289e42a6d1ec995d0cb23aee89efc69fc95749fbd54a610057a3e992dc453db |
| 写意体 SC YShi-Written v0.100 | 中性笔风，略斜，源自 Zen Kurenaido | https://github.com/Steve-Yuu/YShi-Written Releases v0.100 `YShiWrittenSC-Regular.ttf`；OFL.txt | a982a892e780da2736c77b991bf1d40aa059d2fab46ed9ee9e796b2aa04a3a34 |
| **晓声通秋茄 ToneOZ Tsuipita v0.251009（本版新增）** | 中性签字笔风格，教育标准笔形，源自随峰体但经教学笔形校对，与上四款不是同一字体换名 | 官方项目 https://github.com/jeffreyxuan/toneoz-font-tsuipita ；发行页 https://github.com/jeffreyxuan/toneoz-font-tsuipita/releases/tag/v0.251009 中的汉字版 `ToneOZ-Tsuipita-TC.zip`（内含 `ToneOZ-Tsuipita-TC.ttf` 与 OFL.txt）；介绍 https://toneoz.com/blog/download-fonts/ | 463e9b80e2dccc084384207982834229953d9dc6a6e9f1fa9f580640ac1a2d24 |

对应许可证副本见 `fonts/licenses/`（第 5 款使用发行包内附的 OFL.txt）。

说明：用这些字体排出的「沈予安」只是单字并置，**不等于**一个人一气呵成的连续签名，也不能当作对真实笔迹的临摹。

## 章面与图注用字

系统 Noto Sans CJK SC（`fonts-noto-cjk`，SIL OFL）及包内小子集回退。Debian 版权说明见 `licenses/noto-cjk-debian-copyright`。
