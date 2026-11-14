// 시안마다 작업 폴더를 만든다. (설계 6.4절 구조)
import fs from 'node:fs';
import path from 'node:path';
import { toRequirementsMd } from '../core/mustKeep.js';
import { stripFrontMatter } from '../core/skills.js';
import { styleSteering } from '../core/styles.js';
import { workDirOf } from './paths.js';

const TEMPLATE = new URL('../templates/designer-agent.json', import.meta.url);
const BODY_TEXT_LIMIT = 6000;

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/**
 * 작업 폴더를 새로 만든다. 이미 있으면 지우고 다시 만든다.
 * @param {string} runId
 * @param {{id:string,name:string,source:string}} skill
 * @param {string} skillBody SKILL.md 전문. 앞머리(YAML)는 떼고 steering으로 넣는다
 * @param {Array} items MustKeepItem[] (꺼진 항목은 requirements.md에서 빠진다)
 * @param {object} content Content
 * @param {{desktop:{file:string}, mobile:{file:string}}} shots 원본 캡처
 * @returns {string} workDir
 */
export function createWorkspace(runId, skill, skillBody, items, content, shots) {
  const workDir = workDirOf(runId, skill.id);
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(workDir, 'out'), { recursive: true });

  write(path.join(workDir, '.kiro', 'agents', 'designer.json'), fs.readFileSync(TEMPLATE, 'utf8'));
  // 스킬 앞머리(hooks 같은 설정 키가 들어 있을 수 있다)는 떼고 본문만 지침으로 넣는다
  write(
    path.join(workDir, '.kiro', 'steering', 'skill.md'),
    `# 디자인 스킬: ${skill.name}\n\n출처: ${skill.source}\n\n${stripFrontMatter(skillBody).trim()}\n`,
  );
  if (skill.style) write(path.join(workDir, '.kiro', 'steering', 'style.md'), styleSteering(skill.style));
  write(path.join(workDir, '.kiro', 'specs', 'landing', 'requirements.md'), toRequirementsMd(items, content.url));

  // 시안에게 주는 content.json은 본문 전체 글자(fullText)를 잘라서 준다
  const forDesigner = { ...content, bodyText: content.fullText.slice(0, BODY_TEXT_LIMIT) };
  delete forDesigner.fullText;
  // 원본의 이미지·로고·아이콘 등은 역할과 자리를 붙여 따로 준다
  write(path.join(workDir, 'assets.json'), JSON.stringify(content.assets ?? [], null, 2));
  delete forDesigner.assets;
  write(path.join(workDir, 'content.json'), JSON.stringify(forDesigner, null, 2));
  write(path.join(workDir, 'must-keep.json'), JSON.stringify(items, null, 2));
  fs.copyFileSync(shots.desktop.file, path.join(workDir, 'original-desktop.png'));
  fs.copyFileSync(shots.mobile.file, path.join(workDir, 'original-mobile.png'));
  return workDir;
}
