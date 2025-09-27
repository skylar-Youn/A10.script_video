function parseChatGPTResult(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  const items = [];

  for (const line of lines) {
    const match = line.match(/^(\d+)\.?\s*(.+)/);
    if (match) {
      const [, index, title] = match;
      items.push({
        index: parseInt(index),
        text: title.trim()
      });
    }
  }

  if (items.length === 0) {
    lines.forEach((line, i) => {
      if (line.length > 0) {
        items.push({
          index: i + 1,
          text: line
        });
      }
    });
  }

  return items;
}

function parseChatGPTImageResult(text) {
  return parseChatGPTResult(text);
}

function parseChatGPTShortsResult(text) {
  const subtitles = [];
  const images = [];

  let srtText = "";
  const srtMatch1 = text.match(/\*\*\[SRT 자막\]\*\*([\s\S]*?)(?=\*\*\[이미지 장면 묘사\]\*\*|$)/);
  const srtMatch2 = text.match(/\[SRT 자막\]([\s\S]*?)(?=\[이미지 장면 묘사\]|$)/);

  if (srtMatch1) {
    srtText = srtMatch1[1];
  } else if (srtMatch2) {
    srtText = srtMatch2[1];
  } else {
    srtText = text;
  }

  const lines = srtText.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (/^\d+$/.test(line)) {
      const index = parseInt(line);
      i++;

      if (i < lines.length) {
        const timeLine = lines[i].trim();
        const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);

        if (timeMatch) {
          i++;

          const textLines = [];
          while (i < lines.length && lines[i].trim() !== '') {
            textLines.push(lines[i].trim());
            i++;
          }

          const fullText = textLines.join(' ');

          const imageTagMatch = fullText.match(/\[이미지\s*(\d+)\]/);
          const cleanText = fullText.replace(/\[이미지\s*\d+\]/, '').trim();

          subtitles.push({
            index: index,
            start: timeMatch[1],
            end: timeMatch[2],
            text: cleanText,
            scene_tag: imageTagMatch ? `[이미지 ${imageTagMatch[1]}]` : ""
          });
        }
      }
    }
    i++;
  }

  let imageText = "";
  const imageMatch1 = text.match(/\*\*\[이미지 장면 묘사\]\*\*([\s\S]*?)$/);
  const imageMatch2 = text.match(/\[이미지 장면 묘사\]([\s\S]*?)$/);

  if (imageMatch1) {
    imageText = imageMatch1[1];
  } else if (imageMatch2) {
    imageText = imageMatch2[1];
  }

  if (imageText) {
    const imageLines = imageText.split('\n').filter(line => line.trim().match(/^\-?\s*\[이미지\s*\d+\]/));

    imageLines.forEach((line, idx) => {
      const match = line.match(/^\-?\s*\[이미지\s*(\d+)\]\s*(.+)/);
      if (match) {
        const imageNum = parseInt(match[1]);
        const description = match[2].trim();

        images.push({
          tag: `이미지 ${imageNum}`,
          description: description,
          start: null,
          end: null
        });
      }
    });
  }

  return { subtitles, images };
}

export {
  parseChatGPTResult,
  parseChatGPTImageResult,
  parseChatGPTShortsResult
};