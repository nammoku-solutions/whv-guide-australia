import { aiConfig } from "../config";
import type { AnswerVerifier, EvidenceChunk, VerificationResult } from "../types";

/**
 * 何もしない Verifier（V1 の既定）。常に supported を返す。
 * インターフェースは安定しているため、将来「根拠に対する回答の裏取り」を行う実装に
 * 差し替えても chat API を変更する必要はない。
 */
export class NoopVerifier implements AnswerVerifier {
  async verify(
    _answer: string,
    _evidence: EvidenceChunk[],
  ): Promise<VerificationResult> {
    return { supported: true };
  }
}

/**
 * 設定に応じた Verifier を返す。AI_VERIFY_ENABLED=true でも実装未提供の間は Noop。
 * Phase 6 で高リスク回答のみ検証する実装を追加する想定。
 */
export function getVerifier(): AnswerVerifier {
  if (!aiConfig.features.verifyEnabled) return new NoopVerifier();
  // TODO(Phase 6): エビデンス整合性チェックの実装をここで返す。
  return new NoopVerifier();
}
