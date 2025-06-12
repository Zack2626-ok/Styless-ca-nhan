// server.js
import express from "express";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY
});

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static('public'));

const DATA_TYPES = [
  "ao",
  "quan",
  "giay",
  "phu_kien",
  "phong_cach",
  "dish"
];

async function chatAi(prompt) {
  try {
    fs.writeFileSync(path.join('logs', `${(new Date()).getTime()}.prompt.txt`), prompt);

    const completion = await openai.chat.completions.create({
      model: "deepseek/deepseek-chat-v3-0324:free",
      messages: [{ role: "user", content: prompt }],
    });

    fs.writeFileSync(path.join('logs', `${(new Date()).getTime()}.suss.txt`), JSON.stringify(completion, null, 2));

    return completion.choices[0].message.content;
  } catch (err) {
    fs.writeFileSync(path.join('logs', `${(new Date()).getTime()}.err.txt`), JSON.stringify(err, null, 2));
    return undefined;
  }
}

function getFilePath(type) {
  if (!DATA_TYPES.includes(type)) throw new Error("Invalid type");
  return path.join("data", `${type}.json`);
}

app.post("/ai/ask", async (req, res) => {
    let { message, selectedItems, paramHistories, countAsk, lastAsk } = req.body;
  try {
    const jsonStrcut = `{height: number(cm), weight: number(kg), gender: string, season: string, style: string[], ask: string}`;
    const prompt = `Tôi là một stylist cá nhân, hãy phân tích và đưa các dữ liệu phù hợp vào json sau: ${jsonStrcut}.
      Phân tích thông tin người dùng gồm:
      + height: chiều cao (cm)
      + weight: cân nặng (kg)
      + gender: giới tính
      + season: mùa (xuân, hạ, thu, đông)
      + style: phong cách mong muốn (casual, formal, sporty, ...), chấp nhận mảng rỗng
      + ask: câu hỏi tiếp theo nếu thiếu thông tin, nếu đủ thì bỏ trống
      Đây là thông tin người dùng: "${message}".
      ${lastAsk ? `Tin nhắn này trả lời cho câu hỏi: "${lastAsk}"` : ''}
      ${paramHistories ? `Dữ liệu trước đó: ${JSON.stringify(paramHistories)}` : ''}.
      Nếu đã có style rồi thì không hỏi lại.
      Nếu thiếu thông tin, hãy hỏi để lấy được nhiều thông tin nhất.
      Trả về đúng json, không giải thích thêm.`;

    const paramHistoriesStr = await chatAi(prompt);

    // Kiểm tra kỹ trước khi replace
    if (!paramHistoriesStr || typeof paramHistoriesStr !== 'string') {
      return res.json({
        content: 'Không nhận được phản hồi từ AIasdadas 1. Vui lòng thử lại!',
        isErr: true,
        isEnd: true,
        countAsk,
        paramHistories: paramHistories || {
          height: "",
          weight: "",
          gender: "",
          season: "",
          style: []
        }
      });
    }

    // Đoạn này chỉ chạy khi paramHistoriesStr chắc chắn là string
    paramHistories = JSON.parse(
      paramHistoriesStr.replace('```json', '').replace('```', '').trim()
    );

    if (!paramHistories.ask || paramHistories.ask === null || paramHistories.ask.length === 0) {
      // người dùng đã chọn đủ thông tin, chuyển sang bước thứ 2, dùng câu prompt thú 2 để cung cấp món ăn cho người dùng
      // đã có selectedItems là các đầu vào người ta đã có, nếu không chọn thì mình sẽ gợi ý cho người ta
      // đã có paramHistories là các tham số của người dùng
      const ao = JSON.parse(fs.readFileSync(path.join('data', 'ao.json'), 'utf-8'));
      const quan = JSON.parse(fs.readFileSync(path.join('data', 'quan.json'), 'utf-8'));
      const giay = JSON.parse(fs.readFileSync(path.join('data', 'giay.json'), 'utf-8'));
      const phu_kien = JSON.parse(fs.readFileSync(path.join('data', 'phu_kien.json'), 'utf-8'));
      const phong_cach = JSON.parse(fs.readFileSync(path.join('data', 'phong_cach.json'), 'utf-8'));
      const jsonStrcutFinal = `[{name: string, ao: [{id: number}], quan: [{id: number}], giay: [{id: number}], phu_kien: [{id: number}], phong_cach: [{id: number}], description: string}]`;
      const promptFinal = `Đây là các dữ liệu mà chúng tôi thu thập:
        + Dữ liệu về Áo: ${JSON.stringify(ao.map(m => {return {id: m.id, name: m.name_b}}))}
        + Dữ liệu về Quần: ${JSON.stringify(quan.map(m => {return {id: m.id, name: m.name_b}}))}
        + Dữ liệu về Giày: ${JSON.stringify(giay.map(m => {return {id: m.id, name: m.name_b}}))}
        + Dữ liệu về Phụ kiện: ${JSON.stringify(phu_kien.map(m => {return {id: m.id, name: m.name_b}}))}
        + Dữ liệu về Phong cách: ${JSON.stringify(phong_cach.map(m => {return {id: m.id, name: m.name_b}}))}
        Dựa vào các dữ liệu trên, hãy đề xuất cho tôi một số set đồ (nhiều hơn 1) phù hợp với các yêu cầu sau:
        + Chiều cao: ${paramHistories.height}cm
        + Cân nặng: ${paramHistories.weight}kg
        + Giới tính: ${paramHistories.gender}
        + Mùa: ${paramHistories.season}
        + Phong cách: ${paramHistories.style?.join(', ') || ''}
        ${selectedItems && selectedItems.length > 0 ? `+ Ưu tiên sử dụng: ${JSON.stringify(selectedItems)}` : ''}
        Tôi cần bạn trả về cấu trúc json như sau: ${jsonStrcutFinal} với mô tả cụ thể về các trường là:
        + name: tên set đồ
        + ao: danh sách áo (id)
        + quan: danh sách quần (id)
        + giay: danh sách giày (id)
        + phu_kien: danh sách phụ kiện (id)
        + phong_cach: danh sách phong cách (id)
        + description: mô tả chi tiết về set đồ
        Trả ra cho tôi chỉ json và không cần diễn giải thêm`;

      let resultStr = await chatAi(promptFinal);

      if (!resultStr || typeof resultStr !== 'string') {
        return res.json({
          content: 'Không nhận được phản hồi từ AI 2xcsadasda. Vui lòng thử lại!',
          isErr: true,
          isEnd: true,
          countAsk,
          paramHistories
        });
      }

      // Chỉ chạy khi chắc chắn là string
      const jsonIndex = resultStr.indexOf("```json");
      if (jsonIndex !== -1) {
        resultStr = resultStr.substring(jsonIndex);
      }
      let cleanStr = resultStr.replace('```json', '').replace('```', '').trim();
      try {
        const result = JSON.parse(cleanStr);

        const dishs = JSON.parse(fs.readFileSync(path.join('data', 'dish.json'), 'utf-8'));
        
        dishs.push({
          time: new Date(),
          selectedItems,
          paramHistories,
          results: result,
          star: 0
        });

        fs.writeFileSync(path.join('data', 'dish.json'), JSON.stringify(dishs, null, 2));

        return res.json({
          content: result,
          isErr: false,
          isEnd: true,
          countAsk,
          paramHistories           // <-- ĐÚNG, trả về đúng object
        });
      } catch (err) {
        console.error("Lỗi parse JSON kết quả AI:", cleanStr, err);
        return res.json({
          content: 'Kết quả AI trả về không hợp lệ. Vui lòng thử lại!',
          isErr: true,
          isEnd: true,
          countAsk,
          paramHistories: paramHistories || {
            height: "",
            weight: "",
            gender: "",
            season: "",
            style: []
          }
        });
      }
    }
    
    const ask = paramHistories.ask;
    paramHistories.ask = undefined;
    res.json({
      content: ask,
      isErr: false,
      isEnd: false,
      paramHistories: paramHistories || {
        height: "",
        weight: "",
        gender: "",
        season: "",
        style: []
      }
    });
  } catch (error) {
    console.warn(error);
    
    return res.json({
      content: 'Xin lỗi, hệ thống gặp sự cố, vui lòng quay lại sau!',
      isErr: true,
      isEnd: true,
      countAsk,
      paramHistories: {
        height: "",
        weight: "",
        gender: "",
        season: "",
        style: []
      }
    });
  }
});

// API lấy dữ liệu thời trang
app.get('/api/:type', (req, res) => {
  const { type } = req.params;
  try {
    const filePath = getFilePath(type);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
