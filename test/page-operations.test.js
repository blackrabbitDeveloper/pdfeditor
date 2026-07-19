import test from 'node:test';
import assert from 'node:assert/strict';
import { deletePages, duplicatePages, movePages, normalizeRotation, rotatePages } from '../js/page-operations.js';

const pages = [1, 2, 3, 4].map(id => ({ id, rotation: 0 }));

test('회전값을 0~359도로 정규화한다', () => {
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(450), 90);
});

test('선택한 페이지만 회전한다', () => {
  assert.deepEqual(rotatePages(pages, [2, 4], 90).map(page => page.rotation), [0, 90, 0, 90]);
});

test('선택 페이지를 바로 뒤에 복제한다', () => {
  let id = 10;
  assert.deepEqual(duplicatePages(pages, [2], () => id++).map(page => page.id), [1, 2, 10, 3, 4]);
});

test('선택 페이지를 삭제한다', () => {
  assert.deepEqual(deletePages(pages, [1, 3]).map(page => page.id), [2, 4]);
});

test('선택 페이지 묶음을 대상 앞으로 이동한다', () => {
  assert.deepEqual(movePages(pages, [2, 3], 1).map(page => page.id), [2, 3, 1, 4]);
});

