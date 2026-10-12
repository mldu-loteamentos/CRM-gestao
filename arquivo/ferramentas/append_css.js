const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'style.css');
const appendText = `
.subjudice-highlight {
  background-color: #f3f4f6;
  border-left: 4px solid #6b7280;
}

/* Estilos para os sub-níveis de Centro de Custo no resumo de empresas */
.cost-center-row {
  background-color: #f8fafc;
  font-size: 0.85rem;
  transition: all 0.2s;
}
.cost-center-row td {
  border-bottom: 1px solid #e2e8f0;
  padding: 6px 4px;
}
.cost-center-row:hover {
  background-color: #f1f5f9;
}
.cost-center-toggle {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background-color: #e2e8f0;
  color: #475569;
  margin-right: 8px;
  transition: all 0.2s;
}
.cost-center-toggle:hover {
  background-color: #cbd5e1;
  color: #0f172a;
}
`;

try {
  let content = fs.readFileSync(cssPath); // read as buffer
  fs.appendFileSync(cssPath, Buffer.from(appendText, 'utf8'));
  console.log('CSS appended successfully!');
} catch (e) {
  console.error('Error appending CSS:', e);
}
