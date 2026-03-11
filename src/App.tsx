import React, { useState, useRef } from 'react';
import { Document, Packer, Paragraph, TextRun, PageBreak, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, Footer, PageNumber } from 'docx';
import { saveAs } from 'file-saver';
import { FileText, Shuffle, Download, AlertCircle, Settings } from 'lucide-react';

interface Answer {
  originalId: string;
  text: string;
  isCorrect: boolean;
}

interface Question {
  id: number;
  text: string;
  answers: Answer[];
  correctLabel?: string;
  displayId?: number;
}

const parseRichText = (html: string): Question[] => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const markUnderline = (node: Node, isUnderlined: boolean) => {
    let currentUnderlined = isUnderlined;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === 'U' || el.style.textDecoration.includes('underline')) {
        currentUnderlined = true;
      }
    }
    
    if (node.nodeType === Node.TEXT_NODE && currentUnderlined && node.textContent?.trim()) {
      node.textContent = `[[CORRECT]]${node.textContent}`;
    } else {
      Array.from(node.childNodes).forEach(child => markUnderline(child, currentUnderlined));
    }
  };

  markUnderline(tempDiv, false);

  let text = tempDiv.innerHTML;
  text = text.replace(/<br\s*[\/]?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');

  const txtArea = document.createElement('textarea');
  txtArea.innerHTML = text;
  text = txtArea.value;

  const lines = text.split('\n');
  let currentQuestion: Question | null = null;
  const questions: Question[] = [];

  for (let line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const isCorrect = trimmedLine.includes('[[CORRECT]]');
    const cleanLine = trimmedLine.replace(/\[\[CORRECT\]\]/g, '');

    const questionMatch = cleanLine.match(/^Câu\s*\d+[\.\:\s]\s*(.*)/i);
    if (questionMatch) {
      if (currentQuestion) {
        questions.push(currentQuestion);
      }
      currentQuestion = {
        id: questions.length + 1,
        text: questionMatch[1],
        answers: []
      };
      continue;
    }

    const answerMatch = cleanLine.match(/^([A-D])[\.\:\s]\s*(.*)/i);
    if (answerMatch && currentQuestion) {
      currentQuestion.answers.push({
        originalId: answerMatch[1].toUpperCase(),
        text: answerMatch[2],
        isCorrect: isCorrect
      });
      continue;
    }

    if (currentQuestion) {
      if (currentQuestion.answers.length > 0) {
        currentQuestion.answers[currentQuestion.answers.length - 1].text += '\n' + cleanLine;
        if (isCorrect) {
          currentQuestion.answers[currentQuestion.answers.length - 1].isCorrect = true;
        }
      } else {
        currentQuestion.text += '\n' + cleanLine;
      }
    }
  }
  if (currentQuestion) {
    questions.push(currentQuestion);
  }
  return questions;
};

function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export default function App() {
  const [school, setSchool] = useState('');
  const [examType, setExamType] = useState('Định kì HKI');
  const [subject, setSubject] = useState('');
  const [duration, setDuration] = useState('');
  const [generatedExams, setGeneratedExams] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);

  const handleShuffle = () => {
    const html = editorRef.current?.innerHTML || '';
    const parsedQuestions = parseRichText(html);
    if (parsedQuestions.length === 0) {
      alert("Không tìm thấy câu hỏi nào. Vui lòng kiểm tra lại định dạng (Câu 1. ... A. ... B. ...).");
      return;
    }

    const questionsWithoutAnswer = parsedQuestions.filter(q => !q.answers.some(a => a.isCorrect));
    if (questionsWithoutAnswer.length > 0) {
      const qIds = questionsWithoutAnswer.map(q => q.id).join(', ');
      alert(`Cảnh báo: Các câu sau không có đáp án được gạch chân: ${qIds}`);
    }

    const exams = [];
    for (let i = 0; i < 4; i++) {
      const code = 101 + i;
      const shuffledQs = shuffleArray(parsedQuestions).map((q, index) => {
        const shuffledAnswers = shuffleArray(q.answers);
        const correctIndex = shuffledAnswers.findIndex(a => a.isCorrect);
        const correctLabel = correctIndex >= 0 ? ['A', 'B', 'C', 'D'][correctIndex] : '?';
        
        return {
          ...q,
          displayId: index + 1,
          answers: shuffledAnswers,
          correctLabel
        };
      });
      exams.push({ code, questions: shuffledQs });
    }
    setGeneratedExams(exams);
    setActiveTab(0);
  };

  const createAnswerTable = (questions: any[]) => {
    const cols = 4;
    const rows = Math.ceil(questions.length / cols);
    const tableRows = [];

    for (let r = 0; r < rows; r++) {
      const cells = [];
      for (let c = 0; c < cols; c++) {
        const qIdx = r * cols + c;
        const q = questions[qIdx];
        cells.push(
          new TableCell({
            children: [new Paragraph({ text: q ? `Câu ${q.displayId}: ${q.correctLabel}` : '', alignment: AlignmentType.CENTER })],
            width: { size: 100 / cols, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: "auto" },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "auto" },
              left: { style: BorderStyle.SINGLE, size: 1, color: "auto" },
              right: { style: BorderStyle.SINGLE, size: 1, color: "auto" },
            }
          })
        );
      }
      tableRows.push(new TableRow({ children: cells }));
    }

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows
    });
  };

  const handleExport = async () => {
    if (generatedExams.length === 0) return;

    for (const exam of generatedExams) {
      const children: any[] = [];

      // Header (Vertical layout)
      children.push(new Paragraph({ children: [new TextRun({ text: `TRƯỜNG: ${school.toUpperCase()}`, bold: true })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: `KIỂM TRA: ${examType.toUpperCase()}`, bold: true })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: `MÔN: ${subject.toUpperCase()}`, bold: true })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: `Thời gian: ${duration} phút`, bold: true })] }));
      
      children.push(new Paragraph({ spacing: { before: 200 } })); // spacer
      
      children.push(new Paragraph({ text: `Họ tên học sinh: ........................................................` }));
      children.push(new Paragraph({ text: `Lớp: ........................` }));
      
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `MÃ ĐỀ: ${exam.code}`, bold: true, size: 28 }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 400 }
        })
      );

      // Questions
      exam.questions.forEach((q: any) => {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Câu ${q.displayId}. `, bold: true }),
              new TextRun({ text: q.text })
            ],
            spacing: { before: 200, after: 100 }
          })
        );

        const labels = ['A', 'B', 'C', 'D'];
        q.answers.forEach((a: any, aIndex: number) => {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${labels[aIndex]}. `, bold: true }),
                new TextRun({ text: a.text })
              ],
              spacing: { after: 100 }
            })
          );
        });
      });

      // Answer Key
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `ĐÁP ÁN MÃ ĐỀ ${exam.code}`, bold: true, size: 28 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 400 }
        })
      );
      children.push(createAnswerTable(exam.questions));

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: {
                font: "Times New Roman",
                size: 24, // 12pt
              },
            },
          },
        },
        sections: [{
          properties: {},
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: `Mã đề: ${exam.code} - Trang ` }),
                    new TextRun({ children: [PageNumber.CURRENT] }),
                    new TextRun({ text: " / " }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES] })
                  ]
                })
              ]
            })
          },
          children: children
        }]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `De_Kiem_Tra_${subject ? subject.replace(/\s+/g, '_') + '_' : ''}MaDe_${exam.code}.docx`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Shuffle size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Trộn Đề Trắc Nghiệm</h1>
            <p className="text-slate-500 text-sm">Tự động xáo trộn câu hỏi và đáp án, xuất file Word dễ dàng.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Form & Input */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Settings size={20} className="text-slate-400" />
                Thông tin đề kiểm tra
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Trường</label>
                  <input type="text" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="VD: THPT Lê Quý Đôn" value={school} onChange={e => setSchool(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Loại kiểm tra</label>
                  <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" value={examType} onChange={e => setExamType(e.target.value)}>
                    <option>Định kì HKI</option>
                    <option>Định kì HKII</option>
                    <option>CKI</option>
                    <option>CKII</option>
                    <option>Thường xuyên 1</option>
                    <option>Thường xuyên 2</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Môn học</label>
                  <input type="text" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="VD: Toán 12" value={subject} onChange={e => setSubject(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Thời gian (phút)</label>
                  <input type="number" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="VD: 45" value={duration} onChange={e => setDuration(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-[500px]">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FileText size={20} className="text-slate-400" />
                  Nội dung đề gốc
                </h2>
              </div>
              <div className="mb-4 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="font-medium text-slate-700 mb-1 flex items-center gap-1"><AlertCircle size={14}/> Hướng dẫn định dạng:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Mỗi câu hỏi bắt đầu bằng <span className="font-mono font-medium text-indigo-600">Câu 1.</span> hoặc <span className="font-mono font-medium text-indigo-600">Câu 1:</span></li>
                  <li>Mỗi đáp án nằm trên 1 dòng, bắt đầu bằng <span className="font-mono font-medium text-indigo-600">A.</span>, <span className="font-mono font-medium text-indigo-600">B.</span>, <span className="font-mono font-medium text-indigo-600">C.</span>, <span className="font-mono font-medium text-indigo-600">D.</span></li>
                  <li><span className="font-bold text-emerald-600">Đáp án đúng phải được gạch chân</span> (VD: <u>A. Hà Nội</u>). Hãy copy từ Word dán vào đây.</li>
                </ul>
              </div>
              <div 
                ref={editorRef}
                contentEditable
                className="flex-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all overflow-y-auto font-serif text-sm mb-4"
                data-placeholder="Dán đề gốc từ Word vào đây (đáp án đúng phải được gạch chân)..."
              ></div>
              <button 
                onClick={handleShuffle}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <Shuffle size={18} />
                Trộn Đề Ngay
              </button>
            </div>
          </div>

          {/* Right Column: Preview */}
          <div className="lg:col-span-7 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-[820px]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">Xem trước đề đã trộn</h2>
              {generatedExams.length > 0 && (
                <button 
                  onClick={handleExport}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2 text-sm"
                >
                  <Download size={16} />
                  Xuất file Word
                </button>
              )}
            </div>

            {generatedExams.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <FileText size={48} className="opacity-20" />
                <p>Chưa có dữ liệu. Hãy dán đề gốc và bấm "Trộn Đề Ngay".</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex gap-2 border-b border-slate-100 mb-4">
                  {generatedExams.map((exam, idx) => (
                    <button
                      key={exam.code}
                      onClick={() => setActiveTab(idx)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === idx ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                      Mã đề {exam.code}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto pr-4 space-y-6 font-serif text-sm bg-white border border-slate-100 rounded-xl p-8 shadow-inner">
                  {/* Preview Content */}
                  <div className="space-y-1 mb-8 text-left">
                    <div className="font-bold">TRƯỜNG: {school.toUpperCase()}</div>
                    <div className="font-bold">KIỂM TRA: {examType.toUpperCase()}</div>
                    <div className="font-bold">MÔN: {subject.toUpperCase()}</div>
                    <div className="font-bold">Thời gian: {duration} phút</div>
                    <div className="mt-4">Họ tên học sinh: ........................................................</div>
                    <div>Lớp: ........................</div>
                    <div className="text-xl font-bold mt-6 text-center">MÃ ĐỀ: {generatedExams[activeTab].code}</div>
                  </div>

                  <div className="space-y-4">
                    {generatedExams[activeTab].questions.map((q: any) => (
                      <div key={q.displayId} className="space-y-1">
                        <p className="font-bold">Câu {q.displayId}. <span className="font-normal">{q.text}</span></p>
                        <div className="grid grid-cols-1 gap-1 pl-4">
                          {q.answers.map((a: any, aIdx: number) => (
                            <p key={aIdx} className={a.isCorrect ? "text-emerald-600 font-medium underline underline-offset-2" : ""}>
                              <span className="font-bold">{['A', 'B', 'C', 'D'][aIdx]}.</span> {a.text}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Answer Key Preview */}
                  <div className="mt-12 pt-8 border-t border-slate-200">
                    <h3 className="text-lg font-bold text-center mb-6">ĐÁP ÁN MÃ ĐỀ {generatedExams[activeTab].code}</h3>
                    <div className="grid grid-cols-4 gap-3 text-center">
                      {generatedExams[activeTab].questions.map((q: any) => (
                        <div key={q.displayId} className="border border-slate-200 p-2 rounded bg-slate-50">
                          <span className="font-medium">Câu {q.displayId}:</span> <span className="font-bold text-emerald-600">{q.correctLabel || '?'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
