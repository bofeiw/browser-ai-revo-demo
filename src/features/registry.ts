import { Ticket, Search, Scissors, Megaphone } from 'lucide-react'
import type { Feature } from '../types'
export const features: Feature[] = [
 {id:'background-remover',path:'/background-remover',label:'Background Remover',title:'Background Remover',description:'去掉图片背景，保存透明图片。',icon:Scissors},
 {id:'smart-ticket-creator',path:'/smart-ticket-creator',label:'Ticket Creator',title:'Ticket Creator',description:'将问题描述整理为可编辑的工单。',icon:Ticket},
 {id:'campaign-creator',path:'/campaign-creator',label:'Campaign Creator',title:'Campaign Creator',description:'一句话生成可编辑的投放草稿。',icon:Megaphone},
 {id:'semantic-search',path:'/semantic-search',label:'Semantic Search',title:'Semantic Search',description:'按意思查找本地资料。',icon:Search},
]
