import { Fragment, type ReactNode, type CSSProperties } from 'react';
import { BrandedText } from '@/components/brand/logo';
import { jsonObject } from '@/domain/semantic-references';
import { validLink, calloutLabels, type CalloutKind } from '@/domain/structured-content';
import type { JSONValue, TopicContent } from '@/domain/topic-content';
import type { ReviewPackage } from '@/domain/review-package';
import '@/features/editor/structured-editor.css';
/** Pinned read-only React renderer v1: no editor normalization, HTML, data reads or fetch. */
export default function ReleaseBodyV1({ content, frozenPackage:p }: {content:TopicContent;frozenPackage:ReviewPackage}) {
  const node=(n:JSONValue,key:number):ReactNode=>{
    if (!jsonObject(n)) throw new Error('Unsupported release node.');
    const a=jsonObject(n.attrs)?n.attrs:{};
    const children=Array.isArray(n.content)?n.content.map(node):null;
    const conditions=jsonObject(a.conditions)&&Array.isArray(a.conditions.values)?<span className="se-condition-tags" aria-label="Applied conditional tags">
      {a.conditions.values.map((pair,i)=>{
        if (!jsonObject(pair)) throw new Error('Unsupported release conditions.');
        const category=p.categories.find(c=>c.id===pair.categoryId),value=p.values.find(v=>v.id===pair.valueId);
        if (!category||!value) throw new Error('Missing frozen condition.');
        return <span key={i} className="mr-2 text-xs text-muted-foreground"><BrandedText>{`${String(category.name)}: ${String(value.name)}`}</BrandedText></span>;
      })}
    </span>:null;
    let result:ReactNode;
    switch(n.type) {
      case 'text': {
        result=<BrandedText>{String(n.text)}</BrandedText>;
        for(const mark of Array.isArray(n.marks)?n.marks:[]) {
          if(!jsonObject(mark)) throw new Error('Unsupported release mark.');
          switch(mark.type) {
            case 'bold':result=<strong>{result}</strong>;break;
            case 'italic':result=<em>{result}</em>;break;
            case 'underline':result=<u>{result}</u>;break;
            case 'strike':result=<s>{result}</s>;break;
            case 'code':result=<code>{result}</code>;break;
            case 'link': {
              if(!jsonObject(mark.attrs)||typeof mark.attrs.href!=='string'||!validLink(mark.attrs.href)) throw new Error('Unsafe release link.');
              result=<a href={mark.attrs.href} target="_blank" rel="noopener noreferrer">{result}</a>;break;
            }
            default:throw new Error('Unsupported release mark.');
          }
        }
        break;
      }
      case 'paragraph':result=<p>{conditions}{children}</p>;break;
      case 'heading':result=a.level===1?<h1>{conditions}{children}</h1>:a.level===2?<h2>{conditions}{children}</h2>:<h3>{conditions}{children}</h3>;break;
      case 'hardBreak':result=<br/>;break;
      case 'horizontalRule':result=<>{conditions}<hr/></>;break;
      case 'releaseReusable':result=<section className="se-reusable-reference" aria-label="Frozen linked content">{conditions}<p className="text-sm text-muted-foreground"><BrandedText>{String(a.name)}</BrandedText> · Frozen revision {Number(a.revision)}</p>{children}</section>;break;
      case 'blockquote':result=<blockquote>{conditions}{children}</blockquote>;break;
      case 'bulletList':result=<>{conditions}<ul>{children}</ul></>;break;
      case 'orderedList':result=<>{conditions}<ol start={Number(a.start??1)} type={(a.type??'1') as '1'|'a'|'A'|'i'|'I'}>{children}</ol></>;break;
      case 'listItem':result=<li>{conditions}{children}</li>;break;
      case 'codeBlock':result=<>{conditions}<pre><code>{children}</code></pre></>;break;
      case 'table':result=<>{conditions}<div className="overflow-x-auto"><table><tbody>{children}</tbody></table></div></>;break;
      case 'tableRow':result=<tr>{children}</tr>;break;
      case 'tableCell':case 'tableHeader': {
        const Cell=n.type==='tableHeader'?'th':'td';
        const width=Array.isArray(a.colwidth)?a.colwidth.reduce<number>((sum,v)=>sum+Number(v),0):undefined;
        result=<Cell colSpan={Number(a.colspan??1)} rowSpan={Number(a.rowspan??1)} style={{textAlign:a.align as CSSProperties['textAlign'],width}}>{children}</Cell>;break;
      }
      case 'callout':result=<aside role="note" aria-label={calloutLabels[a.kind as CalloutKind]} className="se-callout" data-callout-kind={String(a.kind)}><div className="se-callout-label">{calloutLabels[a.kind as CalloutKind]}</div><div className="se-callout-content">{conditions}{children}</div></aside>;break;
      default:throw new Error('Unsupported release node.');
    }
    return <Fragment key={key}>{result}</Fragment>;
  };
  return <div className="se-root"><div className="se-surface"><div className="ProseMirror" style={{minHeight:0}} role="document" aria-label="Release content">{(content.content as JSONValue[]).map(node)}</div></div></div>;
}
